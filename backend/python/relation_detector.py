# =============================================================================
# relation_detector.py
# =============================================================================
# Finds every table inside a downloaded/uploaded dataset (multiple CSVs in a
# Kaggle archive, several sheets in one Excel workbook, files inside a zip…)
# and automatically detects how they relate to each other:
#
#   1. Primary keys  — a unique, non-null column with an id-like name
#                      (id, customer_id, order_no, product_code, …)
#   2. Foreign keys  — a column in one table whose values are contained in
#                      another table's primary key, backed by a name match
#                      (orders.customer_id → customers.customer_id / customers.id)
#
# Train/test splits (same columns in two files) are treated as one table, and
# Kaggle submission templates are ignored, so competition datasets don't show
# up as fake "related" tables.
#
# The result feeds the multi-table schema editor: each table comes back with
# a profiled schema (ranges, categories, date spans, null rates taken from the
# real data) plus fk_table / fk_field links for generate-multi-table.
# =============================================================================

import os
import re
from typing import Any

import pandas as pd

from analyzer import _infer_type
from dataset_importer import read_tabular_file_to_df

TABULAR_EXTS = {".csv", ".tsv", ".tab", ".txt", ".xlsx", ".xls", ".parquet", ".json", ".jsonl"}

_MAX_TABLES      = 12
_MAX_ROWS        = 50_000        # rows read per table for detection/profiling
_MAX_FILE_BYTES  = 500 * 1024 * 1024
_ID_SUFFIXES     = ("id", "key", "code", "no", "num", "number", "ref")
_SKIP_FILE_RE    = re.compile(r"(^|_)(sample_?)?submission", re.IGNORECASE)
# Internal files other parts of the service write into the dataset folder
_INTERNAL_FILES  = {"synthetic_output.csv", "test_set.csv", "template.csv"}


# ── Naming helpers ───────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(name).strip())   # camelCase → camel_case
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def _singular(word: str) -> str:
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith(("ses", "xes", "ches", "shes")):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def _is_id_like(col_norm: str) -> bool:
    last = col_norm.split("_")[-1]
    return last in _ID_SUFFIXES or col_norm.endswith("id")


def _table_name_from_path(path: str, sheet: str | None = None) -> str:
    base = _norm(os.path.splitext(os.path.basename(path))[0]) or "table"
    if sheet is not None:
        return _norm(sheet) or base
    return base


# ── Loading ──────────────────────────────────────────────────────────────────

def _read_one(path: str) -> list[tuple[str, pd.DataFrame, bool]]:
    """Returns [(table_name, df, truncated)] — Excel files can hold several sheets."""
    ext = os.path.splitext(path)[1].lower()
    if ext in {".xlsx", ".xls"}:
        sheets = pd.read_excel(path, sheet_name=None, nrows=_MAX_ROWS)
        multi = len(sheets) > 1
        return [
            (_table_name_from_path(path, sheet if multi else None), df, len(df) >= _MAX_ROWS)
            for sheet, df in sheets.items()
        ]
    if ext in {".csv", ".tsv", ".tab", ".txt"}:
        sep = "\t" if ext in {".tsv", ".tab"} else None
        for enc in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                df = pd.read_csv(path, sep=sep, engine="python", encoding=enc, nrows=_MAX_ROWS)
                return [(_table_name_from_path(path), df, len(df) >= _MAX_ROWS)]
            except UnicodeDecodeError:
                continue
        return []
    df, _ = read_tabular_file_to_df(path)
    truncated = len(df) > _MAX_ROWS
    return [(_table_name_from_path(path), df.head(_MAX_ROWS), truncated)]


def collect_tables(paths: list[str]) -> dict[str, dict[str, Any]]:
    """Loads every readable table from the given files, skipping splits and junk."""
    found: list[dict[str, Any]] = []
    for path in paths:
        fname = os.path.basename(path)
        if fname in _INTERNAL_FILES or fname.startswith(".") or _SKIP_FILE_RE.search(fname):
            continue
        if os.path.splitext(fname)[1].lower() not in TABULAR_EXTS:
            continue
        try:
            size = os.path.getsize(path)
            if size == 0 or size > _MAX_FILE_BYTES:
                continue
            for name, df, truncated in _read_one(path):
                df = df.dropna(axis=1, how="all")
                if df.empty or len(df.columns) < 1:
                    continue
                found.append({"name": name, "df": df, "truncated": truncated,
                              "source_file": fname, "size": size})
        except Exception as e:
            print(f"[relation_detector] could not read {fname}: {e}")

    # Largest first so splits collapse onto the biggest file (train over test)
    found.sort(key=lambda t: len(t["df"]), reverse=True)

    tables: dict[str, dict[str, Any]] = {}
    kept_colsets: list[set[str]] = []
    for t in found:
        cols = {_norm(c) for c in t["df"].columns}
        # Same (or nearly same) columns as a table we already kept → it's a split, not a relation
        if any(len(cols & k) / max(len(cols | k), 1) >= 0.8 for k in kept_colsets):
            continue
        name = t["name"]
        n = 2
        while name in tables:
            name = f"{t['name']}_{n}"
            n += 1
        tables[name] = t
        kept_colsets.append(cols)
        if len(tables) >= _MAX_TABLES:
            break
    return tables


def list_tabular_files(root: str) -> list[str]:
    out = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            if os.path.splitext(f)[1].lower() in TABULAR_EXTS:
                out.append(os.path.join(dirpath, f))
    return out


# ── Key detection ────────────────────────────────────────────────────────────

def _key_values(series: pd.Series) -> set[str]:
    """String-normalised distinct values so 7, 7.0 and "7" compare equal."""
    s = series.dropna()
    if pd.api.types.is_float_dtype(s) and (s % 1 == 0).all():
        s = s.astype("int64")
    return set(s.astype(str).str.strip().str.lower())


def _detect_primary_key(table_name: str, df: pd.DataFrame) -> str | None:
    n = len(df)
    if n == 0:
        return None
    sing = _singular(table_name)
    best, best_score = None, 0
    for i, col in enumerate(df.columns):
        s = df[col]
        if pd.api.types.is_float_dtype(s) and not (s.dropna() % 1 == 0).all():
            continue
        if s.isnull().any() or s.nunique(dropna=True) != n:
            continue
        cn = _norm(col)
        if cn in {f"{sing}_id", f"{sing}id", f"{table_name}_id", f"{sing}_key", f"{sing}_code", f"{sing}_no"}:
            score = 6
        elif cn == "id":
            score = 5
        elif _is_id_like(cn):
            score = 3
        else:
            continue
        if i == 0:
            score += 1
        if score > best_score:
            best, best_score = col, score
    return best


def _name_match(child_col: str, parent_table: str, parent_pk: str) -> int:
    cn, pn = _norm(child_col), _norm(parent_pk)
    sing = _singular(parent_table)
    if cn == pn and pn != "id":
        return 3
    if cn in {f"{sing}_{pn}", f"{sing}{pn}", f"{sing}_id", f"{parent_table}_id", f"{sing}id"}:
        return 3
    if _is_id_like(cn) and (sing in cn or parent_table in cn):
        return 2
    return 0


def detect_relationships(tables: dict[str, dict[str, Any]]) -> tuple[dict[str, str | None], list[dict[str, Any]]]:
    pks = {name: _detect_primary_key(name, t["df"]) for name, t in tables.items()}
    pk_values = {
        name: _key_values(tables[name]["df"][pk]) for name, pk in pks.items() if pk
    }

    # Integer keys (1..N) contain almost any small integer column, so value
    # overlap alone proves nothing for them — they need a name match.
    int_pk = {
        name: pd.api.types.is_numeric_dtype(tables[name]["df"][pk]) for name, pk in pks.items() if pk
    }

    rels: list[dict[str, Any]] = []
    for child, ct in tables.items():
        cdf = ct["df"]
        for col in cdf.columns:
            cn = _norm(col)
            is_own_pk = col == pks[child]
            child_vals = None
            best = None
            for parent, ppk in pks.items():
                if not ppk or parent == child:
                    continue
                name_score = _name_match(col, parent, ppk)
                if name_score == 0 and (not _is_id_like(cn) or int_pk[parent]):
                    continue
                # A table's own key only points elsewhere on an exact name match (1:1 extension tables)
                if is_own_pk and name_score < 3:
                    continue
                if child_vals is None:
                    child_vals = _key_values(cdf[col])
                if len(child_vals) < 2:
                    break
                match = len(child_vals & pk_values[parent]) / len(child_vals)
                # A sampled/truncated parent can't contain every child value
                need = 0.3 if tables[parent]["truncated"] else 0.6
                ok = (name_score >= 2 and match >= need) or (
                    name_score == 0 and match >= 0.95 and len(child_vals) >= 5
                )
                if not ok:
                    continue
                cand = (name_score, match, parent, ppk)
                if best is None or cand[:2] > best[:2]:
                    best = cand
            if best:
                name_score, match, parent, ppk = best
                confidence = "high" if name_score >= 3 and match >= 0.9 else "medium" if name_score >= 2 else "low"
                rels.append({
                    "child_table": child, "child_field": str(col),
                    "parent_table": parent, "parent_field": str(ppk),
                    "match_rate": round(match, 3), "confidence": confidence,
                })
    return pks, rels


# ── Column profiling (real-data constraints for schema-based generation) ─────

def _looks_like_date(series: pd.Series) -> pd.Series | None:
    sample = series.dropna().astype(str).head(200)
    if sample.empty or sample.str.contains(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}").mean() < 0.9:
        return None
    parsed = pd.to_datetime(series, errors="coerce")
    if parsed.notna().sum() >= 0.9 * series.notna().sum():
        return parsed
    return None


def profile_table(df: pd.DataFrame, pk: str | None) -> list[dict[str, Any]]:
    schema = []
    for col in df.columns:
        s = df[col]
        ftype = _infer_type(s)
        c: dict[str, Any] = {"null_rate": round(min(float(s.isnull().mean()) * 100, 50), 1)}
        nn = s.dropna()

        if ftype == "string":
            parsed = _looks_like_date(s)
            if parsed is not None and parsed.notna().any():
                ftype = "date"
                c["date_from"] = parsed.min().strftime("%Y-%m-%d")
                c["date_to"]   = parsed.max().strftime("%Y-%m-%d")

        if ftype in ("integer", "float") and not nn.empty:
            c["min_val"] = float(nn.min())
            c["max_val"] = float(nn.max())
            try:
                skew = float(nn.skew())
                c["distribution"] = "skewed" if abs(skew) > 1 else "normal"
            except Exception:
                c["distribution"] = "uniform"
        elif ftype == "boolean" and not nn.empty:
            c["true_ratio"] = round(float(nn.astype(bool).mean()), 3)
        elif ftype == "string" and not nn.empty:
            uniq = nn.astype(str).str.strip()
            nunique = uniq.nunique()
            if nunique <= 30 and nunique / max(len(uniq), 1) < 0.5:
                values = [v for v in uniq.value_counts().index.tolist() if v and "," not in v]
                if values:
                    c["enum_values"] = ", ".join(values)
            else:
                c["cardinality"] = int(nunique)

        if col == pk and ftype in ("integer", "float"):
            ftype = "integer"

        schema.append({
            "name": str(col),
            "type": ftype,
            "nullable": bool(s.isnull().any()),
            "sample_values": nn.head(3).astype(str).tolist(),
            "constraints": c,
            "is_pk": col == pk,
        })
    return schema


# ── Entry point ──────────────────────────────────────────────────────────────

def build_related_tables(paths: list[str], primary_source: str | None = None) -> dict[str, Any] | None:
    """
    Returns {"primary_table", "related_tables", "relationships"} when the files
    contain two or more distinct tables, otherwise None (single-table dataset).
    primary_source is the file name the single-table CTGAN path already uses.
    """
    tables = collect_tables(paths)
    if len(tables) < 2:
        return None

    pks, rels = detect_relationships(tables)
    fk_by_col = {(r["child_table"], r["child_field"]): r for r in rels}

    # primary_source may be a file path/name or a table name
    src = os.path.basename(primary_source) if primary_source else None
    primary = next(
        (n for n, t in tables.items() if src and (t["source_file"] == src or n == _norm(os.path.splitext(src)[0]))),
        next(iter(tables)),
    )

    related = []
    for name, t in tables.items():
        schema = profile_table(t["df"], pks[name])
        for f in schema:
            r = fk_by_col.get((name, f["name"]))
            if r:
                f["fk_table"] = r["parent_table"]
                f["fk_field"] = r["parent_field"]
        related.append({
            "name": name,
            "source_file": t["source_file"],
            "row_count": int(len(t["df"])),
            "primary_key": pks[name],
            "schema": schema,
        })

    # Parents first so the editor reads top-down (customers → orders → order_items)
    parents_of = {n: {r["parent_table"] for r in rels if r["child_table"] == n} for n in tables}
    ordered: list[str] = []
    remaining = set(tables)
    while remaining:
        ready = [n for n in tables if n in remaining and not (parents_of[n] & remaining)]
        if not ready:  # cycle — keep the original order for the rest
            ready = [n for n in tables if n in remaining]
        for n in ready:
            ordered.append(n)
            remaining.discard(n)
    related.sort(key=lambda t: ordered.index(t["name"]))

    return {"primary_table": primary, "related_tables": related, "relationships": rels}
