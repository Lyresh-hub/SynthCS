import pandas as pd
from typing import Any


_DTYPE_MAP = {
    "int64": "integer", "int32": "integer", "int16": "integer", "int8": "integer",
    "float64": "float", "float32": "float",
    "bool": "boolean",
}


def _infer_type(series: pd.Series) -> str:
    dtype_str = str(series.dtype)

    if dtype_str in _DTYPE_MAP:
        return _DTYPE_MAP[dtype_str]

    if "datetime" in dtype_str:
        return "date"

    if dtype_str == "object":
        sample = series.dropna().head(30).astype(str)
        if sample.str.fullmatch(r"[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}").any():
            return "email"
        if sample.str.fullmatch(r"\+?[\d\s\-(). ]{7,15}").any():
            return "phone"
        return "string"

    return "string"


def analyze_dataset(csv_path: str) -> list[dict[str, Any]]:
    """
    Read up to 2000 rows of a CSV and return a schema list with
    name, type, nullable, and three sample values per column.
    """
    df = pd.read_csv(csv_path, nrows=2000)

    schema = []
    for col in df.columns:
        series = df[col]
        col_type = _infer_type(series)
        nullable = bool(series.isnull().any())
        samples = series.dropna().head(3).astype(str).tolist()

        schema.append({
            "name": col,
            "type": col_type,
            "nullable": nullable,
            "sample_values": samples,
        })

    return schema
