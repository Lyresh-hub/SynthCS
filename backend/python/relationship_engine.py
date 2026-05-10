"""
Relationship/dependency rule engine — enforces if-then constraints on a DataFrame
after CTGAN/schema generation, turning random independent columns into correlated ones.

Example:
    If login_status == "SUCCESS" then failed_attempts <= 2
    If transaction_amount > 5000 then risk_score >= 0.7
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _condition_mask(series: pd.Series, op: str, value: str) -> pd.Series:
    """Return boolean mask where `series <op> value` is True."""
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
    """Mutate df[col] on rows where mask=True according to (op, value)."""
    if col not in df.columns:
        return
    k = int(mask.sum())
    if k == 0:
        return

    if op == "set":
        df.loc[mask, col] = value

    elif op == "one_of":
        choices = [v.strip() for v in str(value).split(",")]
        df.loc[mask, col] = np.random.choice(choices, size=k)

    elif op == "set_range":
        parts = [float(x) for x in str(value).split(",")]
        lo, hi = parts[0], parts[1] if len(parts) > 1 else parts[0] + 1
        df.loc[mask, col] = np.round(np.random.uniform(lo, hi, size=k), 2)

    elif op == "set_int_range":
        parts = [int(float(x)) for x in str(value).split(",")]
        lo, hi = parts[0], parts[1] if len(parts) > 1 else parts[0] + 1
        df.loc[mask, col] = np.random.randint(lo, hi + 1, size=k)

    elif op == "clamp_max":
        nums = pd.to_numeric(df.loc[mask, col], errors="coerce")
        df.loc[mask, col] = nums.clip(upper=float(value))

    elif op == "clamp_min":
        nums = pd.to_numeric(df.loc[mask, col], errors="coerce")
        df.loc[mask, col] = nums.clip(lower=float(value))


def apply_rules(df: pd.DataFrame, rules: list[dict[str, Any]]) -> pd.DataFrame:
    """
    Apply a list of if-then relationship rules to df.

    Rule dict keys
    --------------
    if_col   str   column whose value triggers the rule
    if_op    str   eq | neq | gt | lt | gte | lte | in
    if_val   str   comparison value (use "a,b,c" for `in`)
    then_col str   column to modify when condition is True
    then_op  str   set | one_of | set_range | set_int_range | clamp_max | clamp_min
    then_val str   argument for the consequence
                   set          → literal value to assign
                   one_of       → "A,B,C" — random choice from list
                   set_range    → "lo,hi" — random float in [lo,hi]
                   set_int_range→ "lo,hi" — random int in [lo,hi]
                   clamp_max    → upper cap
                   clamp_min    → lower floor
    """
    if not rules:
        return df
    df = df.copy()
    for rule in rules:
        if_col   = rule.get("if_col",   "")
        if_op    = rule.get("if_op",    "eq")
        if_val   = rule.get("if_val",   "")
        then_col = rule.get("then_col", "")
        then_op  = rule.get("then_op",  "set")
        then_val = rule.get("then_val", "")
        if not if_col or not then_col:
            continue
        if if_col not in df.columns:
            continue
        mask = _condition_mask(df[if_col], if_op, if_val)
        _apply_consequence(df, mask, then_col, then_op, then_val)
    return df
