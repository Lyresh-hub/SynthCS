# =============================================================================
# relationship_engine.py
# =============================================================================
# Post-generation rule engine: enforces IF–THEN constraints across columns.
# This is the "Relationship Rules" panel in the Schema Editor.
#
# Why it runs post-generation: CTGAN/Copula generate each column semi-independently.
# That means you'll get rows like {login_status: "SUCCESS", failed_attempts: 47}
# which is nonsense. This engine fixes those contradictions after generation.
#
# How it works:
#   1. User defines rules in the UI: IF login_status = "FAILURE" THEN failed_attempts > 5
#   2. Frontend sends them as a list of rule dicts to the /api/generate endpoint
#   3. main.py calls apply_rules(df, rules) here
#   4. For each rule: find rows matching the IF condition, then modify the THEN column
#
# apply_rules() is the only function main.py calls. The two helpers below it
# (_condition_mask, _apply_consequence) are internal.
# =============================================================================

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _condition_mask(series: pd.Series, op: str, value: str) -> pd.Series:
    # Returns a boolean Series — True where the IF condition matches.
    # eq/neq compare as strings (handles mixed types safely).
    # gt/lt/gte/lte coerce to numeric first — non-numeric rows become NaN
    # which evaluates False in comparisons, so they're safely excluded.
    if op == "eq":
        return series.astype(str) == str(value)
    if op == "neq":
        return series.astype(str) != str(value)
    num = pd.to_numeric(series, errors="coerce")
    if op == "gt":  return num > float(value)
    if op == "lt":  return num < float(value)
    if op == "gte": return num >= float(value)
    if op == "lte": return num <= float(value)
    if op == "in":
        # "in" takes a comma-separated value string: "A, B, C"
        vals = {v.strip() for v in str(value).split(",")}
        return series.astype(str).isin(vals)
    return pd.Series([False] * len(series), index=series.index)


def _apply_consequence(
    df: pd.DataFrame,
    mask: pd.Series,
    col: str,
    op: str,
    value: str,
) -> None:
    # Mutates df[col] in-place on the rows where mask=True.
    # Returns early if the column doesn't exist or no rows match — silently
    # ignoring missing columns is intentional: the rule is just a no-op.
    if col not in df.columns:
        return
    k = int(mask.sum())
    if k == 0:
        return

    if op == "set":
        # Hard-set every matching row to this literal value
        df.loc[mask, col] = value

    elif op == "one_of":
        # Pick a random value from a comma-separated list for each matching row.
        # Good for "IF status = CANCELLED THEN reason = one_of: refund, chargeback, fraud"
        choices = [v.strip() for v in str(value).split(",")]
        df.loc[mask, col] = np.random.choice(choices, size=k)

    elif op == "set_range":
        # Random float in [lo, hi] — "IF risk_flag = high THEN risk_score = set_range: 0.7, 1.0"
        parts = [float(x) for x in str(value).split(",")]
        lo, hi = parts[0], parts[1] if len(parts) > 1 else parts[0] + 1
        df.loc[mask, col] = np.round(np.random.uniform(lo, hi, size=k), 2)

    elif op == "set_int_range":
        # Same but integer
        parts = [int(float(x)) for x in str(value).split(",")]
        lo, hi = parts[0], parts[1] if len(parts) > 1 else parts[0] + 1
        df.loc[mask, col] = np.random.randint(lo, hi + 1, size=k)

    elif op == "clamp_max":
        # Cap values that exceed the upper bound — leaves values below the cap alone
        nums = pd.to_numeric(df.loc[mask, col], errors="coerce")
        df.loc[mask, col] = nums.clip(upper=float(value))

    elif op == "clamp_min":
        # Floor values below the lower bound
        nums = pd.to_numeric(df.loc[mask, col], errors="coerce")
        df.loc[mask, col] = nums.clip(lower=float(value))


def apply_rules(df: pd.DataFrame, rules: list[dict[str, Any]]) -> pd.DataFrame:
    # Fast no-op if no rules were configured
    if not rules:
        return df
    # Work on a copy — the caller (main.py) owns the original df
    df = df.copy()
    for rule in rules:
        if_col   = rule.get("if_col",   "")
        if_op    = rule.get("if_op",    "eq")
        if_val   = rule.get("if_val",   "")
        then_col = rule.get("then_col", "")
        then_op  = rule.get("then_op",  "set")
        then_val = rule.get("then_val", "")
        # Skip malformed rules silently — better than crashing mid-generation
        if not if_col or not then_col:
            continue
        if if_col not in df.columns:
            continue
        mask = _condition_mask(df[if_col], if_op, if_val)
        _apply_consequence(df, mask, then_col, then_op, then_val)
    return df
