# =============================================================================
# analyzer.py
# =============================================================================
# Runs a quick schema inference pass on a downloaded CSV.
# Called right after a dataset lands on disk so the Schema Editor
# can pre-populate field names, types, and sample values.
#
# Only reads 2000 rows — enough to infer types without loading a 100k-row
# file into memory. Speed matters here because it blocks the UI.
# =============================================================================

import pandas as pd
from typing import Any


# Maps pandas dtype strings to our frontend-friendly type names.
# Anything not in this map falls through to the object-branch below.
_DTYPE_MAP = {
    "int64": "integer", "int32": "integer", "int16": "integer", "int8": "integer",
    "float64": "float", "float32": "float",
    "bool": "boolean",
}


def _infer_type(series: pd.Series) -> str:
    # Fast path: numeric and bool dtypes are unambiguous
    dtype_str = str(series.dtype)

    if dtype_str in _DTYPE_MAP:
        return _DTYPE_MAP[dtype_str]

    if "datetime" in dtype_str:
        return "date"

    if dtype_str == "object":
        # For string columns we sample up to 30 non-null values and run regex
        # against all of them. .any() means "at least one match" — that's loose
        # on purpose. A column with 1 email in 30 values should still type as email.
        sample = series.dropna().head(30).astype(str)
        if sample.str.fullmatch(r"[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}").any():
            return "email"
        if sample.str.fullmatch(r"\+?[\d\s\-(). ]{7,15}").any():
            return "phone"
        return "string"

    return "string"


def analyze_dataset(csv_path: str) -> list[dict[str, Any]]:
    # 2000-row cap — fast enough that the API response doesn't time out,
    # but representative enough to catch nulls and get real sample values.
    df = pd.read_csv(csv_path, nrows=2000)

    schema = []
    for col in df.columns:
        series = df[col]
        col_type = _infer_type(series)
        nullable = bool(series.isnull().any())
        # Three samples is enough for the UI preview. We stringify them because
        # the frontend just displays them — it doesn't need typed values here.
        samples = series.dropna().head(3).astype(str).tolist()

        schema.append({
            "name": col,
            "type": col_type,
            "nullable": nullable,
            "sample_values": samples,
        })

    return schema
