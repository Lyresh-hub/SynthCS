# =============================================================================
# dataset_importer.py
# =============================================================================
# Handles ingestion of diverse dataset formats uploaded by users:
#   - Archives: .zip, .tar, .tar.gz, .tgz, .gz
#   - Delimited text: .csv, .tsv, .tab, .txt
#   - Excel workbooks: .xlsx, .xls
#   - Columnar: .parquet
#   - JSON formats: .json, .jsonl
#
# Converts any tabular data into the canonical dataset.csv used by CTGAN,
# schema analysis, and generation pipelines.
# =============================================================================

import os
import io
import re
import json
import zipfile
import tarfile
import gzip
import shutil
from typing import Tuple
import pandas as pd


SUPPORTED_EXTENSIONS = {
    ".csv", ".tsv", ".tab", ".txt",
    ".xlsx", ".xls",
    ".parquet",
    ".json", ".jsonl",
    ".zip", ".tar", ".gz", ".tgz",
}


def _safe_extract_zip(archive_path: str, extract_dir: str):
    """Extract zip file securely, preventing directory traversal (Zip Slip)."""
    with zipfile.ZipFile(archive_path, "r") as zf:
        extract_dir_abs = os.path.abspath(extract_dir)
        for member in zf.infolist():
            target_path = os.path.abspath(os.path.join(extract_dir, member.filename))
            if not target_path.startswith(extract_dir_abs):
                raise ValueError(f"Unsafe path in zip archive: {member.filename}")
        zf.extractall(extract_dir)


def _safe_extract_tar(archive_path: str, extract_dir: str):
    """Extract tar file securely, preventing directory traversal."""
    with tarfile.open(archive_path, "r:*") as tf:
        extract_dir_abs = os.path.abspath(extract_dir)
        for member in tf.getmembers():
            target_path = os.path.abspath(os.path.join(extract_dir, member.name))
            if not target_path.startswith(extract_dir_abs):
                raise ValueError(f"Unsafe path in tar archive: {member.name}")
        tf.extractall(extract_dir)


def read_tabular_file_to_df(file_path: str) -> Tuple[pd.DataFrame, str]:
    """
    Reads any supported tabular data file into a pandas DataFrame.
    Returns (df, detected_format_description).
    """
    ext = os.path.splitext(file_path)[1].lower()

    # 1. Parquet
    if ext == ".parquet":
        df = pd.read_parquet(file_path)
        return df, "Parquet"

    # 2. Excel (.xlsx, .xls)
    if ext in {".xlsx", ".xls"}:
        df = pd.read_excel(file_path)
        return df, "Excel Spreadsheet"

    # 3. JSON / JSON Lines (.json, .jsonl)
    if ext in {".json", ".jsonl"}:
        # .jsonl → JSON Lines first; .json → standard JSON array first.
        # (A one-line JSON array read as JSON Lines turns every record into a column.)
        attempts = [(True, "JSON Lines"), (False, "JSON")]
        if ext == ".json":
            attempts.reverse()
        for lines, label in attempts:
            try:
                df = pd.read_json(file_path, lines=lines)
                cells_are_records = len(df) == 1 and df.map(lambda v: isinstance(v, dict)).all(axis=None)
                if not df.empty and len(df.columns) > 1 and not cells_are_records:
                    return df, label
            except Exception:
                pass

        # Handle wrapped JSON, e.g. {"data": [...]} or {"records": [...]}
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)

        if isinstance(data, list):
            df = pd.DataFrame(data)
            return df, "JSON"
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    df = pd.DataFrame(v)
                    return df, f"JSON ({k})"
        raise ValueError("Could not parse JSON file into tabular records.")

    # 4. Delimited text (.csv, .tsv, .tab, .txt)
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            # sep=None with python engine automatically detects delimiter (comma, tab, semicolon, pipe)
            df = pd.read_csv(file_path, sep=None, engine="python", encoding=enc)
            if not df.empty:
                return df, "Delimited Text / CSV"
        except Exception:
            continue

    # Fallback with standard comma separation
    df = pd.read_csv(file_path, encoding="utf-8", encoding_errors="replace")
    return df, "CSV"


def process_uploaded_file(uploaded_bytes: bytes, filename: str, dest_dir: str) -> Tuple[str, str]:
    """
    Processes an uploaded dataset file:
      - If archive (.zip, .tar, .tar.gz, etc.), extracts and finds primary tabular file
      - If tabular file (.csv, .xlsx, .parquet, .json, .tsv), parses directly
      - Normalizes column names
      - Caps rows at 20,000 for server memory stability
      - Writes canonical `dataset.csv` in dest_dir
    Returns:
      (canonical_csv_path, table_name)
    """
    os.makedirs(dest_dir, exist_ok=True)
    raw_ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0] or "uploaded_dataset"

    is_archive = (
        raw_ext in {".zip", ".tar", ".gz", ".tgz"}
        or filename.lower().endswith(".tar.gz")
    )

    if is_archive:
        archive_path = os.path.join(dest_dir, f"source_archive{raw_ext}")
        with open(archive_path, "wb") as f:
            f.write(uploaded_bytes)

        unpacked_dir = os.path.join(dest_dir, "unpacked")
        os.makedirs(unpacked_dir, exist_ok=True)

        if raw_ext == ".zip":
            _safe_extract_zip(archive_path, unpacked_dir)
        elif raw_ext in {".tar", ".tgz"} or filename.lower().endswith(".tar.gz"):
            _safe_extract_tar(archive_path, unpacked_dir)
        elif raw_ext == ".gz":
            out_name = os.path.splitext(filename)[0]
            out_path = os.path.join(unpacked_dir, out_name)
            with gzip.open(archive_path, "rb") as f_in, open(out_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        else:
            raise ValueError(f"Unsupported archive extension: {raw_ext}")

        # Scan for tabular files
        candidate_exts = {".csv", ".tsv", ".tab", ".txt", ".xlsx", ".xls", ".parquet", ".json", ".jsonl"}
        found_files = []
        for root, _, files in os.walk(unpacked_dir):
            for f in files:
                f_ext = os.path.splitext(f)[1].lower()
                if f_ext in candidate_exts and not f.startswith("."):
                    full_p = os.path.join(root, f)
                    try:
                        size = os.path.getsize(full_p)
                        if size > 0:
                            found_files.append((full_p, f_ext, size, f))
                    except OSError:
                        pass

        if not found_files:
            raise ValueError("No tabular dataset file (.csv, .xlsx, .parquet, .json, .tsv) found inside the archive.")

        # Sort priority: standard tabular files first, then largest file
        def _candidate_rank(item):
            full_p, f_ext, size, fname = item
            if f_ext == ".csv":
                prio = 10
            elif f_ext in {".parquet", ".xlsx", ".xls"}:
                prio = 8
            elif f_ext in {".tsv", ".tab"}:
                prio = 6
            elif f_ext in {".json", ".jsonl"}:
                prio = 5
            else:
                prio = 2
            return (prio, size)

        found_files.sort(key=_candidate_rank, reverse=True)
        best_file, _, _, best_fname = found_files[0]

        df, _ = read_tabular_file_to_df(best_file)
        table_name = os.path.splitext(best_fname)[0] or base_name

    else:
        # Direct tabular file upload
        temp_input = os.path.join(dest_dir, f"source_input{raw_ext}")
        with open(temp_input, "wb") as f:
            f.write(uploaded_bytes)

        df, _ = read_tabular_file_to_df(temp_input)
        table_name = base_name

    # Clean DataFrame columns
    df = df.dropna(axis=1, how="all")
    clean_cols = []
    seen_cols = set()
    for idx, c in enumerate(df.columns):
        col_str = str(c).strip() or f"column_{idx + 1}"
        # Deduplicate column names if needed
        cand = col_str
        counter = 1
        while cand.lower() in seen_cols:
            cand = f"{col_str}_{counter}"
            counter += 1
        seen_cols.add(cand.lower())
        clean_cols.append(cand)
    df.columns = clean_cols

    # Cap row count at 20,000 (safe limit for server memory)
    if len(df) > 20_000:
        df = df.sample(20_000, random_state=42).reset_index(drop=True)

    final_csv_path = os.path.join(dest_dir, "dataset.csv")
    df.to_csv(final_csv_path, index=False)

    return final_csv_path, table_name
