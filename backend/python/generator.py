import os
import glob
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.model_selection import train_test_split


_MAX_TRAINING_ROWS = 20_000


# ── helpers ──────────────────────────────────────────────────────────────────

def _encode_dates(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
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


# ── Gaussian Copula synthesizer ───────────────────────────────────────────────

def _gaussian_copula_sample(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """
    Synthesise n rows from df using a Gaussian copula.

    Numeric columns: marginal distribution is preserved via the empirical CDF;
    inter-column correlations are captured with a Gaussian copula.

    Categorical columns: sampled i.i.d. from the empirical frequency distribution.
    """
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    synthetic = pd.DataFrame(index=range(n))

    # ── categorical columns ──────────────────────────────────────────────────
    for col in cat_cols:
        counts = df[col].value_counts(dropna=True)
        probs  = counts / counts.sum()
        synthetic[col] = np.random.choice(probs.index, size=n, p=probs.values)

    # ── numeric columns via Gaussian copula ─────────────────────────────────
    if num_cols:
        data = df[num_cols].copy()

        # Convert each column to standard-normal scores via its empirical CDF
        # (adding small jitter breaks ties without changing the distribution)
        normal_scores = np.empty((len(data), len(num_cols)))
        for i, col in enumerate(num_cols):
            vals = data[col].values.astype(float)
            rank = stats.rankdata(vals + np.random.normal(0, 1e-9, len(vals)))
            u = rank / (len(rank) + 1)          # uniform [0,1]
            normal_scores[:, i] = stats.norm.ppf(u)

        # Fit correlation matrix and make it positive-definite
        corr = np.corrcoef(normal_scores, rowvar=False)
        corr = np.clip(corr, -0.999, 0.999)
        np.fill_diagonal(corr, 1.0)
        # Nearest symmetric PD via eigenvalue clip
        eigvals, eigvecs = np.linalg.eigh(corr)
        eigvals = np.clip(eigvals, 1e-6, None)
        corr_pd = eigvecs @ np.diag(eigvals) @ eigvecs.T

        try:
            L = np.linalg.cholesky(corr_pd)
        except np.linalg.LinAlgError:
            L = np.eye(len(num_cols))

        # Sample correlated standard normals, convert to uniform, then to
        # original marginals via empirical quantile interpolation
        Z = np.random.randn(n, len(num_cols)) @ L.T
        U = stats.norm.cdf(Z)

        for i, col in enumerate(num_cols):
            sorted_vals = np.sort(df[col].dropna().values.astype(float))
            quantile_pts = np.linspace(0, 1, len(sorted_vals))
            synthetic[col] = np.interp(U[:, i], quantile_pts, sorted_vals)

    # Restore original column order
    return synthetic.reindex(columns=df.columns)


# ── public API ────────────────────────────────────────────────────────────────

def expand_template_with_ctgan(dataset_path: str, row_count: int) -> str:
    """Scale up a 200-row faker template to row_count rows."""
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

    synthetic = _gaussian_copula_sample(df, row_count)
    synthetic = _decode_dates(synthetic, date_cols)

    output_path = os.path.join(dataset_path, "synthetic_output.csv")
    synthetic.to_csv(output_path, index=False)
    return output_path


def generate_synthetic_data(dataset_path: str, changes: list[dict], row_count: int) -> str:
    """
    Synthesise row_count rows from the downloaded Kaggle CSV using a Gaussian
    copula, then apply any user-specified column renames / type casts.
    """
    csv_files = glob.glob(os.path.join(dataset_path, "**", "*.csv"), recursive=True)
    csv_files += glob.glob(os.path.join(dataset_path, "*.csv"))
    if not csv_files:
        raise FileNotFoundError("No CSV file found in dataset path")

    csv_path = max(csv_files, key=os.path.getsize)
    df = pd.read_csv(csv_path)

    if len(df) > _MAX_TRAINING_ROWS:
        df = df.sample(_MAX_TRAINING_ROWS, random_state=42).reset_index(drop=True)

    df = df.dropna(axis=1, how="all")
    df, date_cols = _encode_dates(df)

    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].fillna("unknown")
        else:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val if pd.notna(median_val) else 0)

    # 80/20 split — keep a held-out test set for the validation endpoint
    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
    _decode_dates(test_df.copy(), date_cols).to_csv(
        os.path.join(dataset_path, "test_set.csv"), index=False
    )

    synthetic = _gaussian_copula_sample(train_df, row_count)
    synthetic = _decode_dates(synthetic, date_cols)

    # ── apply user-specified changes ─────────────────────────────────────────
    rename_map:        dict[str, str] = {}
    type_cast_map:     dict[str, str] = {}
    enforce_not_null:  list[str]      = []

    for change in changes:
        orig, new       = change["original_name"], change["new_name"]
        orig_type, new_type = change["original_type"], change["new_type"]
        nullable        = change["nullable"]

        if orig != new:
            rename_map[orig] = new
        if orig_type != new_type:
            type_cast_map[orig] = new_type
        if not nullable:
            enforce_not_null.append(orig)

    for orig_col, target_type in type_cast_map.items():
        if orig_col in synthetic.columns:
            synthetic[orig_col] = _cast_column(synthetic[orig_col], target_type)

    if enforce_not_null:
        existing = [c for c in enforce_not_null if c in synthetic.columns]
        if existing:
            synthetic = synthetic.dropna(subset=existing)

    if rename_map:
        synthetic = synthetic.rename(columns=rename_map)

    output_path = os.path.join(dataset_path, "synthetic_output.csv")
    synthetic.to_csv(output_path, index=False)
    return output_path
