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


# Signatures of common non-table files that are sometimes renamed to .csv
_BINARY_SIGNATURES = {
    b"\x89PNG": "a PNG image", b"\xff\xd8\xff": "a JPEG image", b"GIF8": "a GIF image",
    b"%PDF": "a PDF document", b"PK\x03\x04": "a ZIP / Office file", b"\x1f\x8b": "a GZIP archive",
    b"MZ": "a program (.exe)", b"\xd0\xcf\x11\xe0": "an old Office document",
}
_TEXT_EXTS = {".csv", ".tsv", ".tab", ".txt", ".json", ".jsonl"}


def _text_encoding(file_path: str) -> str | None:
    """Text files only: refuse disguised binary files and detect UTF-16.
    Returns "utf-16" for UTF-16 text, otherwise None (try the usual encodings)."""
    with open(file_path, "rb") as f:
        head = f.read(8192)
    if head.startswith((b"\xff\xfe", b"\xfe\xff")):
        return "utf-16"
    if len(head) >= 4 and head[1::2].count(0) > len(head) * 0.4:   # UTF-16 without a BOM: every 2nd byte is 0
        return "utf-16-le"
    for sig, kind in _BINARY_SIGNATURES.items():
        if head.startswith(sig):
            raise ValueError(f"This file is not a table — it looks like {kind} renamed to "
                             f"{os.path.splitext(file_path)[1]}. Please upload a real .csv, .xlsx, .json or .parquet file.")
    if b"\x00" in head:
        raise ValueError("This file is not readable text (it contains binary data). "
                         "Please upload a real .csv, .xlsx, .json or .parquet file.")
    return None


def read_tabular_file_to_df(file_path: str) -> Tuple[pd.DataFrame, str]:
    """
    Reads any supported tabular data file into a pandas DataFrame.
    Returns (df, detected_format_description).
    """
    ext = os.path.splitext(file_path)[1].lower()
    if os.path.getsize(file_path) == 0:
        raise ValueError("The file is empty (0 bytes). Please choose a file that contains data.")
    forced_encoding = _text_encoding(file_path) if ext in _TEXT_EXTS else None

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
        try:
            with open(file_path, "r", encoding=forced_encoding or "utf-8", errors="replace") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            raise ValueError("This JSON file isn't valid JSON, so it can't be read as a table.")

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
    encodings = [forced_encoding] if forced_encoding else ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    header_only = None
    for enc in encodings:
        try:
            # sep=None with python engine automatically detects delimiter (comma, tab, semicolon, pipe)
            df = pd.read_csv(file_path, sep=None, engine="python", encoding=enc)
            if not df.empty:
                return df, "Delimited Text / CSV"
            if len(df.columns) and header_only is None:
                header_only = df
        except Exception:
            continue
    if header_only is not None:
        return header_only, "Delimited Text / CSV"   # caller explains "no data rows"

    # Fallback with standard comma separation
    try:
        df = pd.read_csv(file_path, encoding=forced_encoding or "utf-8", encoding_errors="replace")
    except pd.errors.EmptyDataError:
        raise ValueError("The file has no data — no column names or rows were found.")
    except (pd.errors.ParserError, UnicodeError) as e:
        raise ValueError("We couldn't read this file as a table. Check that it is a valid CSV: one header row, "
                         "then one row per line, with the same number of columns in every row.") from e
    return df, "CSV"


MIN_ROWS_FOR_CTGAN = 10   # fewer real rows than this and CTGAN can't learn anything useful


def process_uploaded_file(uploaded_bytes: bytes, filename: str, dest_dir: str) -> Tuple[str, str, list]:
    """
    Processes an uploaded dataset file:
      - If archive (.zip, .tar, .tar.gz, etc.), extracts and finds primary tabular file
      - If tabular file (.csv, .xlsx, .parquet, .json, .tsv), parses directly
      - Normalizes column names
      - Caps rows at 20,000 for server memory stability
      - Writes canonical `dataset.csv` in dest_dir
    Returns:
      (canonical_csv_path, table_name, notes) — notes: plain-language things the
      student should know (empty columns removed, rows sampled, too few rows…)
    """
    notes: list[str] = []
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

    # A table needs column names AND at least one data row
    if len(df.columns) == 0:
        raise ValueError("No columns were found in this file.")
    if len(df) == 0:
        raise ValueError("The file has column names but no data rows. Add at least one row of data below the header.")

    # Clean DataFrame columns — completely empty columns are removed (and the student is told)
    empty_cols = [str(c) for c in df.columns if df[c].isna().all()]
    if empty_cols and len(empty_cols) == len(df.columns):
        raise ValueError("Every column in this file is empty — there is no data to learn from.")
    if empty_cols:
        shown = ", ".join(f'"{c}"' for c in empty_cols[:5]) + (f" and {len(empty_cols) - 5} more" if len(empty_cols) > 5 else "")
        notes.append(f"Removed {len(empty_cols)} empty column{'s' if len(empty_cols) > 1 else ''} with no values: {shown}.")
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
        notes.append(f"The file has {len(df):,} rows; a random 20,000 were kept for learning.")
        df = df.sample(20_000, random_state=42).reset_index(drop=True)
    if len(df) < MIN_ROWS_FOR_CTGAN:
        notes.append(f"Only {len(df)} data row{'s' if len(df) != 1 else ''}. CTGAN needs at least {MIN_ROWS_FOR_CTGAN} "
                     f"real rows to learn from — add more rows, or describe the dataset and use AI generation instead.")

    final_csv_path = os.path.join(dest_dir, "dataset.csv")
    df.to_csv(final_csv_path, index=False)

    return final_csv_path, table_name, notes
