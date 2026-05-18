# =============================================================================
# generator.py
# =============================================================================
# This is where the actual data generation happens.
# Two methods live here — CTGAN (the main one) and Gaussian Copula (the backup).
#
# Two functions get called from main.py:
#   - expand_template_with_ctgan()  → pure LLM path, no real data, uses Copula
#   - generate_synthetic_data()     → real dataset path, uses CTGAN
# =============================================================================

import os
import glob
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.model_selection import train_test_split


# ── Constants ─────────────────────────────────────────────────────────────────
# Tuned for HuggingFace free tier — it's not a beefy machine, so we keep
# training lightweight. Bump these up if you ever move to better hardware.

_MAX_TRAINING_ROWS = 5_000   # Anything above 5k rows gets randomly sampled
                              # down to this before CTGAN sees it. HF free tier
                              # will OOM if you throw 100k rows at CTGAN.

_CTGAN_EPOCHS      = 50      # Full passes through the training data.
                              # Was 75 before — dropped to 50 to cut train time.
                              # Quality difference is minimal for most datasets.

_CTGAN_BATCH_SIZE  = 500     # Rows per gradient update step.
                              # 500 is safe on 16GB RAM. Don't go too high.


# ── Helpers ───────────────────────────────────────────────────────────────────
# Internal utils — not called directly by main.py.


def _encode_dates(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    # CTGAN and Gaussian Copula both choke on date strings like "2023-01-15".
    # They only speak numbers. So we convert dates to ordinals (integer count
    # of days since year 1) before training, then decode them back afterward.
    #
    # We handle two cases:
    #   1. Column pandas already typed as datetime
    #   2. Column that looks like object/string but actually contains dates
    #
    # Returns the modified df + a list of which columns we touched,
    # so _decode_dates knows what to convert back.
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
                pass  # not a date column, move on
    return df, date_cols


def _decode_dates(df: pd.DataFrame, date_cols: list[str]) -> pd.DataFrame:
    # Reverse of _encode_dates. Takes ordinal integers back to "YYYY-MM-DD" strings.
    # CTGAN sometimes spits out floats (e.g. 738535.7) so we round first.
    # clip(lower=1) guards against any negative ordinals sneaking through.
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
    # User changed a column's type in the Schema Editor — we apply that here
    # after generation. Pretty straightforward coercions.
    #
    # Worth noting: integer cast uses fillna(0) because pandas int dtype has
    # no NaN support. So any nulls silently become 0. This is the source of
    # some of those 0s people notice in the output.
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
        pass  # if the cast blows up, return the column as-is
    return series


# ── Gaussian Copula ───────────────────────────────────────────────────────────

def _gaussian_copula_sample(df: pd.DataFrame, n: int) -> pd.DataFrame:
    # Our statistical fallback. Not as powerful as CTGAN but way faster,
    # needs no PyTorch, and works fine on small/fake datasets.
    #
    # Strategy:
    #   - Categorical columns: count frequencies, sample proportionally.
    #     If "Male" is 60% of the original, it'll be ~60% of synthetic too.
    #   - Numeric columns: use a Gaussian Copula to preserve both the shape
    #     of each column's distribution AND the correlations between columns.
    #     e.g. if salary goes up with experience, synthetic data keeps that.

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    synthetic = pd.DataFrame(index=range(n))

    # Categorical: just sample from the empirical frequency distribution
    for col in cat_cols:
        counts = df[col].value_counts(dropna=True)
        probs  = counts / counts.sum()
        synthetic[col] = np.random.choice(probs.index, size=n, p=probs.values)

    if num_cols:
        data = df[num_cols].copy()

        # Step 1: rank-transform each column into standard normal scores.
        # This lets us measure correlations across columns fairly regardless
        # of their original scale. Tiny jitter breaks ties in the ranking.
        normal_scores = np.empty((len(data), len(num_cols)))
        for i, col in enumerate(num_cols):
            vals = data[col].values.astype(float)
            rank = stats.rankdata(vals + np.random.normal(0, 1e-9, len(vals)))
            u = rank / (len(rank) + 1)
            normal_scores[:, i] = stats.norm.ppf(u)

        # Step 2: build the correlation matrix from those normal scores,
        # then make it positive-definite (PD). Floating point noise can make
        # it technically invalid — eigenvalue clipping fixes that cleanly.
        corr = np.corrcoef(normal_scores, rowvar=False)
        corr = np.clip(corr, -0.999, 0.999)
        np.fill_diagonal(corr, 1.0)
        eigvals, eigvecs = np.linalg.eigh(corr)
        eigvals = np.clip(eigvals, 1e-6, None)
        corr_pd = eigvecs @ np.diag(eigvals) @ eigvecs.T

        # Step 3: Cholesky decomposition gives us a triangular matrix L
        # such that L @ L.T = corr_pd. We use it to inject the correlation
        # structure into random normal samples. Falls back to identity (no
        # correlation) if decomposition fails for whatever reason.
        try:
            L = np.linalg.cholesky(corr_pd)
        except np.linalg.LinAlgError:
            L = np.eye(len(num_cols))

        # Step 4: generate correlated standard normals, convert to uniform [0,1]
        Z = np.random.randn(n, len(num_cols)) @ L.T
        U = stats.norm.cdf(Z)

        # Step 5: map those uniform values back to the original value range
        # via quantile interpolation. This ensures synthetic values stay within
        # the same bounds as the real data.
        for i, col in enumerate(num_cols):
            sorted_vals = np.sort(df[col].dropna().values.astype(float))
            quantile_pts = np.linspace(0, 1, len(sorted_vals))
            generated = np.interp(U[:, i], quantile_pts, sorted_vals)
            # If the original was all whole numbers, keep synthetic as int too
            orig_vals = df[col].dropna().values
            if np.all(orig_vals == orig_vals.astype(int)):
                synthetic[col] = np.round(generated).astype(int)
            else:
                synthetic[col] = np.round(generated, 2)

    return synthetic.reindex(columns=df.columns)


# ── Public API ────────────────────────────────────────────────────────────────
# These two are the only functions main.py actually calls.


def expand_template_with_ctgan(dataset_path: str, row_count: int) -> str:
    # Called on the pure LLM fallback path — user typed a prompt, smart search
    # found nothing real, so the system generated a 200-row Faker template
    # from the LLM schema. This function scales that up to row_count rows.
    #
    # Despite the function name, this does NOT use CTGAN. It uses Gaussian Copula.
    # Here's why: CTGAN needs real statistical patterns to learn from. A 200-row
    # Faker template has none — the values were procedurally generated from
    # constraints, not observed from the real world. Feeding that to CTGAN would
    # just teach it to reproduce random noise. Gaussian Copula is the right tool
    # here because it scales up whatever structure exists in the template as-is.
    #
    # The function name is legacy from an earlier version. Kept it to avoid
    # breaking the /api/expand-with-ctgan endpoint name in main.py.

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
    # The main generation function. Called when the user has a real downloaded
    # dataset — whether from manual search (Kaggle/HF/UCI/OpenML) or from the
    # AI Augmented path where smart search found something.
    #
    # Flow:
    #   1. Find the original CSV (skip anything we generated ourselves)
    #   2. Sample down to 5k rows if needed, drop empty columns, encode dates
    #   3. Fill nulls — CTGAN cannot handle NaN at all
    #   4. 80/20 train/test split — test set saved for the validation endpoint
    #   5. Train CTGAN, generate row_count synthetic rows
    #   6. If CTGAN crashes for any reason, silently fall back to Gaussian Copula
    #   7. Apply schema changes the user made in the editor (renames, type casts)
    #   8. Save synthetic_output.csv, return the path

    # Step 1: find the source CSV, skipping our own generated files
    # Also skips *_master.csv — those are entity master tables from relational gen
    _exclude = {"template.csv", "test_set.csv", "synthetic_output.csv"}
    all_csv = glob.glob(os.path.join(dataset_path, "**", "*.csv"), recursive=True)
    all_csv += glob.glob(os.path.join(dataset_path, "*.csv"))
    csv_files = list(dict.fromkeys(
        f for f in all_csv
        if os.path.basename(f) not in _exclude
        and not os.path.basename(f).endswith("_master.csv")
    ))
    if not csv_files:
        raise FileNotFoundError("No CSV file found in dataset path")

    # If there are multiple CSVs (some datasets come zipped with extras),
    # take the largest one — most likely the main data file
    csv_path = max(csv_files, key=os.path.getsize)
    df = pd.read_csv(csv_path)

    # Step 2: cap rows, clean up
    if len(df) > _MAX_TRAINING_ROWS:
        df = df.sample(_MAX_TRAINING_ROWS, random_state=42).reset_index(drop=True)

    df = df.dropna(axis=1, how="all")
    df, date_cols = _encode_dates(df)

    # Step 3: fill nulls — CTGAN hard requirement, no NaNs allowed
    # Known side effect: CTGAN learns these fill values as real data,
    # so you'll see a lot of median values / "unknown" in the output.
    # That's a known limitation, not a bug.
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].fillna("unknown")
        else:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val if pd.notna(median_val) else 0)

    # Step 4: 80/20 split. Test set gets date-decoded immediately and saved.
    # The /api/validate endpoint reads test_set.csv later to compute stats.
    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
    _decode_dates(test_df.copy(), date_cols).to_csv(
        os.path.join(dataset_path, "test_set.csv"), index=False
    )

    # Step 5: tell CTGAN which columns are categorical
    # CTGAN uses a different internal representation for text vs numbers
    discrete_columns = [col for col in train_df.columns if train_df[col].dtype == object]

    # Step 6: train and sample. Lazy import keeps server startup fast —
    # PyTorch takes a few seconds to load so we only do it when actually needed.
    try:
        from ctgan import CTGAN
        model = CTGAN(epochs=_CTGAN_EPOCHS, batch_size=_CTGAN_BATCH_SIZE, verbose=False)
        model.fit(train_df, discrete_columns=discrete_columns)
        synthetic = model.sample(row_count)
    except Exception:
        # CTGAN can fail if the dataset is too small, RAM runs out, or PyTorch
        # has a bad day. Gaussian Copula as silent fallback keeps us alive.
        synthetic = _gaussian_copula_sample(train_df, row_count)

    synthetic = _decode_dates(synthetic, date_cols)

    # Step 7: apply whatever the user changed in the Schema Editor
    rename_map:        dict[str, str] = {}
    type_cast_map:     dict[str, str] = {}
    enforce_not_null:  list[str]      = []

    for change in changes:
        orig, new           = change["original_name"], change["new_name"]
        orig_type, new_type = change["original_type"], change["new_type"]
        nullable            = change["nullable"]

        if orig != new:
            rename_map[orig] = new
        if orig_type != new_type:
            type_cast_map[orig] = new_type
        if not nullable:
            enforce_not_null.append(orig)

    # Type casts before renames — column names still match the original here
    for orig_col, target_type in type_cast_map.items():
        if orig_col in synthetic.columns:
            synthetic[orig_col] = _cast_column(synthetic[orig_col], target_type)

    # Drop rows with nulls in columns the user marked as NOT NULL
    if enforce_not_null:
        existing = [c for c in enforce_not_null if c in synthetic.columns]
        if existing:
            synthetic = synthetic.dropna(subset=existing)

    # Rename last so earlier steps can still reference original column names
    if rename_map:
        synthetic = synthetic.rename(columns=rename_map)

    # Step 8: save
    output_path = os.path.join(dataset_path, "synthetic_output.csv")
    synthetic.to_csv(output_path, index=False)
    return output_path
