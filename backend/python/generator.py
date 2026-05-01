import os
import glob
import pandas as pd
import numpy as np
from ctgan import CTGAN
from sklearn.model_selection import train_test_split


# Maximum rows used to train CTGAN (prevents OOM on huge datasets)
_MAX_TRAINING_ROWS = 50_000


def _detect_discrete_columns(df: pd.DataFrame) -> list[str]:
    discrete = []
    for col in df.columns:
        if df[col].dtype == object or str(df[col].dtype) == "bool":
            discrete.append(col)
        elif df[col].dtype in ("int64", "int32", "int16", "int8") and df[col].nunique() <= 30:
            discrete.append(col)
    return discrete


def _encode_dates(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Convert datetime-like columns to integer ordinals for CTGAN."""
    date_cols = []
    for col in df.columns:
        if "datetime" in str(df[col].dtype):
            df[col] = df[col].map(lambda x: x.toordinal() if pd.notna(x) else np.nan)
            date_cols.append(col)
        elif df[col].dtype == object:
            try:
                parsed = pd.to_datetime(df[col], infer_datetime_format=True, errors="raise")
                df[col] = parsed.map(lambda x: x.toordinal() if pd.notna(x) else np.nan)
                date_cols.append(col)
            except Exception:
                pass
    return df, date_cols


def _decode_dates(df: pd.DataFrame, date_cols: list[str]) -> pd.DataFrame:
    for col in date_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .round()
                .clip(lower=1)
                .astype(int)
                .map(lambda x: pd.Timestamp.fromordinal(x).strftime("%Y-%m-%d"))
            )
    return df


def _cast_column(series: pd.Series, new_type: str) -> pd.Series:
    try:
        if new_type == "integer":
            return pd.to_numeric(series, errors="coerce").fillna(0).astype(int)
        if new_type == "float":
            return pd.to_numeric(series, errors="coerce").fillna(0.0).astype(float)
        if new_type == "boolean":
            return series.astype(bool)
        if new_type in ("string", "email", "phone", "address", "name", "uuid"):
            return series.astype(str)
        if new_type == "date":
            return pd.to_datetime(series, errors="coerce").dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    return series


def expand_template_with_ctgan(dataset_path: str, row_count: int) -> str:
    """
    Train CTGAN on the faker-generated template (template.csv) and
    scale up to row_count synthetic rows.

    High-cardinality string columns (UUIDs, emails, phones, etc.) are excluded
    from CTGAN training — they'd each need 200 categories which crashes the model.
    Those columns are re-populated by sampling from the template after generation.
    """
    template_path = os.path.join(dataset_path, "template.csv")
    if not os.path.exists(template_path):
        raise FileNotFoundError("template.csv not found. Generate a template first.")

    df = pd.read_csv(template_path)
    df = df.dropna(axis=1, how="all")
    df, date_cols = _encode_dates(df)

    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].fillna("unknown")
        else:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val if pd.notna(median_val) else 0)

    n = len(df)
    # Columns where almost every value is unique can't be learned by CTGAN
    high_card_cols = [
        col for col in df.columns
        if df[col].dtype == object and df[col].nunique() >= n * 0.7
    ]
    ctgan_df = df.drop(columns=high_card_cols)

    if ctgan_df.empty or len(ctgan_df.columns) == 0:
        # Nothing left to model — sample directly from template
        synthetic = df.sample(row_count, replace=True).reset_index(drop=True)
    else:
        discrete_columns = _detect_discrete_columns(ctgan_df)
        ctgan = CTGAN(epochs=100, verbose=True)
        ctgan.fit(ctgan_df, discrete_columns)
        synthetic = ctgan.sample(row_count)

        # Re-attach high-cardinality columns by sampling from template values
        for col in high_card_cols:
            synthetic[col] = np.random.choice(df[col].values, row_count, replace=True)

        # Restore original column order
        synthetic = synthetic.reindex(columns=df.columns)

    synthetic = _decode_dates(synthetic, date_cols)

    output_path = os.path.join(dataset_path, "synthetic_output.csv")
    synthetic.to_csv(output_path, index=False)
    return output_path


def generate_synthetic_data(dataset_path: str, changes: list[dict], row_count: int) -> str:
    """
    Train CTGAN on the original downloaded CSV, generate `row_count` rows,
    then apply ONLY the user-specified changes (rename / type-cast / nullable).
    Everything else in the output is left exactly as CTGAN produced it.
    """
    csv_files = glob.glob(os.path.join(dataset_path, "**", "*.csv"), recursive=True)
    csv_files += glob.glob(os.path.join(dataset_path, "*.csv"))
    if not csv_files:
        raise FileNotFoundError("No CSV file found in dataset path")

    csv_path = max(csv_files, key=os.path.getsize)
    df = pd.read_csv(csv_path)

    # Sample to keep training time reasonable
    if len(df) > _MAX_TRAINING_ROWS:
        df = df.sample(_MAX_TRAINING_ROWS, random_state=42).reset_index(drop=True)

    # Drop columns that are entirely null
    df = df.dropna(axis=1, how="all")

    # Encode date columns to ordinals
    df, date_cols = _encode_dates(df)

    # Fill remaining nulls per column type
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].fillna("unknown")
        else:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val if pd.notna(median_val) else 0)

    # ── 80/20 split: train on 80%, hold out 20% for validation ──────────────
    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
    # Decode dates so test_set.csv has the same format as synthetic_output.csv
    _decode_dates(test_df.copy(), date_cols).to_csv(
        os.path.join(dataset_path, "test_set.csv"), index=False
    )

    discrete_columns = _detect_discrete_columns(train_df)

    # Train CTGAN on the 80% training set only
    ctgan = CTGAN(epochs=100, verbose=True)
    ctgan.fit(train_df, discrete_columns)

    # Generate the requested number of rows
    synthetic = ctgan.sample(row_count)

    # Restore date columns to human-readable strings
    synthetic = _decode_dates(synthetic, date_cols)

    # -----------------------------------------------------------------------
    # Apply ONLY user-specified changes — nothing else is touched.
    # -----------------------------------------------------------------------
    rename_map: dict[str, str] = {}
    type_cast_map: dict[str, str] = {}
    enforce_not_null: list[str] = []

    for change in changes:
        orig = change["original_name"]
        new = change["new_name"]
        orig_type = change["original_type"]
        new_type = change["new_type"]
        nullable = change["nullable"]

        if orig != new:
            rename_map[orig] = new

        if orig_type != new_type:
            type_cast_map[orig] = new_type

        if not nullable:
            enforce_not_null.append(orig)

    # Apply type casts (using original column names before rename)
    for orig_col, target_type in type_cast_map.items():
        if orig_col in synthetic.columns:
            synthetic[orig_col] = _cast_column(synthetic[orig_col], target_type)

    # Enforce non-nullable: drop rows where specified columns are null
    if enforce_not_null:
        existing = [c for c in enforce_not_null if c in synthetic.columns]
        if existing:
            synthetic = synthetic.dropna(subset=existing)

    # Rename columns last (so above steps can use original names)
    if rename_map:
        synthetic = synthetic.rename(columns=rename_map)

    output_path = os.path.join(dataset_path, "synthetic_output.csv")
    synthetic.to_csv(output_path, index=False)
    return output_path
