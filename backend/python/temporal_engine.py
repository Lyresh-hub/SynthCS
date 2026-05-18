# =============================================================================
# temporal_engine.py
# =============================================================================
# Realistic timestamp generation with optional business-hours bias.
# Called by main.py when the user enables "Temporal Configuration" in the
# Schema Editor.
#
# The business-hours bias is the interesting part: instead of generating uniform
# random timestamps across the full date range, we oversample by 6x and then
# weight-sample based on time-of-day and day-of-week. This makes the resulting
# distribution look like real enterprise log data — most activity Mon-Fri 8-6,
# barely anything at 3am on a Sunday.
#
# If the dataset has multiple timestamp columns (e.g. created_at + updated_at),
# the first one gets the generated values and subsequent ones get jittered
# forward (so updated_at > created_at, as you'd expect).
# =============================================================================

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd


def _business_weight(hour: int, dow: int) -> float:
    # dow: 0=Monday, 6=Sunday. Weekends get a low but nonzero weight so there
    # are at least some weekend records — realistic for most web apps.
    if dow >= 5:              # Saturday / Sunday
        return 0.08
    if 8 <= hour < 18:       # Core business hours — peak activity
        return 1.0
    if (6 <= hour < 8) or (18 <= hour < 21):   # Shoulder hours
        return 0.20
    return 0.04              # Middle of the night


def generate_timestamps(
    n: int,
    start: str | None = None,
    end: str | None = None,
    business_hours_bias: bool = True,
    ordered: bool = False,
) -> list[str]:
    # Default range: last 90 days up to now. Reasonable for most log datasets.
    now = datetime.utcnow()
    start_dt = datetime.fromisoformat(start) if start else (now - timedelta(days=90))
    end_dt   = datetime.fromisoformat(end)   if end   else now
    total_sec = max(1, int((end_dt - start_dt).total_seconds()))

    if not business_hours_bias:
        # Simple uniform random — no weighting needed
        offsets = np.random.randint(0, total_sec, size=n)
        results = [
            (start_dt + timedelta(seconds=int(s))).strftime("%Y-%m-%d %H:%M:%S")
            for s in offsets
        ]
    else:
        # Oversample 6x (minimum 2000 candidates), compute a weight per candidate,
        # then weighted-sample back down to n. This is way simpler than trying to
        # directly sample from a piecewise distribution over the date range.
        pool = max(n * 6, 2000)
        raw_offsets = np.random.randint(0, total_sec, size=pool)
        candidates  = [start_dt + timedelta(seconds=int(s)) for s in raw_offsets]
        weights     = np.array(
            [_business_weight(c.hour, c.weekday()) for c in candidates],
            dtype=float,
        )
        weights /= weights.sum()  # normalize to a probability distribution
        chosen = np.random.choice(pool, size=n, replace=True, p=weights)
        results = [candidates[i].strftime("%Y-%m-%d %H:%M:%S") for i in chosen]

    if ordered:
        results.sort()
    return results


def apply_temporal(df: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    # No-op if the user didn't enable temporal config. Zero performance cost
    # on the normal path.
    if not config.get("enabled", False):
        return df

    n        = len(df)
    start    = config.get("start_date") or None
    end      = config.get("end_date") or None
    biz      = config.get("business_hours", True)
    ordered  = config.get("ordered", False)
    ts_cols  = config.get("timestamp_columns") or []

    # Auto-detect timestamp columns if the user didn't specify explicit ones
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
            # Subsequent columns (e.g. response_time, resolved_at) get jittered
            # 1 second to 1 hour forward from the base timestamp.
            # This keeps event ordering sensible without making them identical.
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
