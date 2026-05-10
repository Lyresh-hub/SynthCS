"""
Temporal simulation engine — realistic timestamp generation with business-hours bias
and ordered event-sequence support.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd


def _business_weight(hour: int, dow: int) -> float:
    """Return a sampling weight for a given (hour-of-day, day-of-week) pair."""
    if dow >= 5:              # Saturday / Sunday
        return 0.08
    if 8 <= hour < 18:       # Core business hours
        return 1.0
    if (6 <= hour < 8) or (18 <= hour < 21):   # Shoulder hours
        return 0.20
    return 0.04              # Night


def generate_timestamps(
    n: int,
    start: str | None = None,
    end: str | None = None,
    business_hours_bias: bool = True,
    ordered: bool = False,
) -> list[str]:
    """
    Generate n ISO-format timestamps (YYYY-MM-DD HH:MM:SS).

    With business_hours_bias=True the distribution is heavily weighted towards
    Monday–Friday 08:00–18:00, mirroring real enterprise log patterns.
    With ordered=True the output is sorted ascending (event-sequence mode).
    """
    now = datetime.utcnow()
    start_dt = datetime.fromisoformat(start) if start else (now - timedelta(days=90))
    end_dt   = datetime.fromisoformat(end)   if end   else now
    total_sec = max(1, int((end_dt - start_dt).total_seconds()))

    if not business_hours_bias:
        offsets = np.random.randint(0, total_sec, size=n)
        results = [
            (start_dt + timedelta(seconds=int(s))).strftime("%Y-%m-%d %H:%M:%S")
            for s in offsets
        ]
    else:
        # Oversample then weight-sample
        pool = max(n * 6, 2000)
        raw_offsets = np.random.randint(0, total_sec, size=pool)
        candidates  = [start_dt + timedelta(seconds=int(s)) for s in raw_offsets]
        weights     = np.array(
            [_business_weight(c.hour, c.weekday()) for c in candidates],
            dtype=float,
        )
        weights /= weights.sum()
        chosen = np.random.choice(pool, size=n, replace=True, p=weights)
        results = [candidates[i].strftime("%Y-%m-%d %H:%M:%S") for i in chosen]

    if ordered:
        results.sort()
    return results


def apply_temporal(df: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """
    Overwrite timestamp-like columns in df with realistically distributed values.

    Config keys
    -----------
    enabled            bool   (default False — no-op if False)
    start_date         str    e.g. "2024-01-01"  (defaults to 90 days ago)
    end_date           str    e.g. "2024-12-31"  (defaults to now)
    business_hours     bool   (default True)
    ordered            bool   (default False)
    timestamp_columns  list   explicit list; empty = auto-detect by column name
    """
    if not config.get("enabled", False):
        return df

    n        = len(df)
    start    = config.get("start_date") or None
    end      = config.get("end_date") or None
    biz      = config.get("business_hours", True)
    ordered  = config.get("ordered", False)
    ts_cols  = config.get("timestamp_columns") or []

    if not ts_cols:
        ts_cols = [
            c for c in df.columns
            if any(kw in c.lower() for kw in
                   ("timestamp", "time", "date", "created", "updated", "logged", "_at"))
        ]

    if not ts_cols:
        return df

    base = generate_timestamps(n, start, end, biz, ordered)

    for i, col in enumerate(ts_cols):
        if col not in df.columns:
            continue
        if i == 0:
            df[col] = base
        else:
            # Later columns (e.g. response_time) are jittered forward from base
            jitter = np.random.randint(1, 3600, size=n)
            jittered = []
            for ts, jit in zip(base, jitter):
                try:
                    dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") + timedelta(seconds=int(jit))
                    jittered.append(dt.strftime("%Y-%m-%d %H:%M:%S"))
                except Exception:
                    jittered.append(ts)
            df[col] = jittered

    return df
