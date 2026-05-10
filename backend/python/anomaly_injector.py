"""
Anomaly injection engine — inserts realistic attack payloads and anomalous rows
into synthetic datasets for cybersecurity model training.
"""
from __future__ import annotations

import random
from typing import Any

import numpy as np
import pandas as pd


_SQL_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT NULL,NULL --",
    "1' AND 1=1 --",
    "admin'--",
    "' OR 1=1 #",
    "1; SELECT SLEEP(5) --",
    "') OR ('1'='1",
    "'; EXEC xp_cmdshell('dir') --",
    "' AND SUBSTR(username,1,1)='a",
]

_XSS_PAYLOADS = [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert('XSS')",
    "<svg/onload=alert(1)>",
    '"><script>document.location="http://evil.com"</script>',
    "<iframe src='javascript:alert(1)'></iframe>",
    "<body onload=alert('XSS')>",
    "<input type='text' onfocus=alert(1) autofocus>",
]

_INVALID_JWTS = [
    "eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4ifQ.",
    "Bearer eyJhbGciOiJIUzI1NiJ9.INVALID.payload",
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.",
    "null",
    "undefined",
    "{}",
    "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.FAKE_SIGNATURE",
]

_IMPOSSIBLE_TIMESTAMPS = [
    "2099-01-01 00:00:00",
    "1970-01-01 00:00:00",
    "0000-00-00 00:00:00",
    "2038-01-19 03:14:07",
    "9999-12-31 23:59:59",
]


def _rand_ip() -> str:
    return f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def _inject_brute_force(df: pd.DataFrame, idx: int) -> None:
    for col in df.columns:
        lc = col.lower()
        if "failed" in lc or "attempt" in lc:
            df.at[idx, col] = random.randint(10, 99)
        elif "login" in lc and "status" in lc:
            df.at[idx, col] = "FAILURE"
        elif lc in ("event", "action", "event_type"):
            df.at[idx, col] = "LOGIN_FAILURE"
        elif "ip" in lc and "src" not in lc:
            df.at[idx, col] = _rand_ip()


def _inject_port_scan(df: pd.DataFrame, idx: int) -> None:
    src = _rand_ip()
    for col in df.columns:
        lc = col.lower()
        if "src" in lc and "ip" in lc:
            df.at[idx, col] = src
        elif "dst" in lc and "port" in lc:
            df.at[idx, col] = random.randint(1, 65535)
        elif "protocol" in lc:
            df.at[idx, col] = "TCP"
        elif "packet" in lc and ("count" in lc or "rate" in lc):
            df.at[idx, col] = random.randint(500, 5000)
        elif "flag" in lc:
            df.at[idx, col] = "SYN"
        elif lc in ("label", "attack_type", "category", "attack"):
            df.at[idx, col] = "PortScan"


def _inject_impossible_ts(df: pd.DataFrame, idx: int) -> None:
    for col in df.columns:
        if any(kw in col.lower() for kw in ("timestamp", "time", "date", "created", "updated")):
            df.at[idx, col] = random.choice(_IMPOSSIBLE_TIMESTAMPS)
            break


def _mark_anomaly(df: pd.DataFrame, idx: int) -> None:
    """Set an anomaly label column if one exists."""
    label_names = {"label", "is_anomaly", "anomaly", "is_attack", "attack_flag", "malicious"}
    for col in df.columns:
        if col.lower() in label_names:
            if df[col].dtype in (int, float, "int64", "float64", np.int64, np.float64):
                df.at[idx, col] = 1
            else:
                df.at[idx, col] = "anomaly"
            break


def inject_anomalies(df: pd.DataFrame, config: dict[str, Any]) -> pd.DataFrame:
    """
    Inject realistic attack payloads into a fraction of rows.

    Config keys
    -----------
    enabled  bool         (default False)
    ratio    float 0–0.5  fraction of rows to modify (default 0.05)
    types    list[str]    any of: sql_injection, xss, brute_force,
                          port_scan, invalid_jwt, impossible_timestamp
    """
    if not config.get("enabled", False):
        return df

    types  = config.get("types") or ["sql_injection"]
    ratio  = float(config.get("ratio", 0.05))
    ratio  = max(0.001, min(ratio, 0.5))
    n      = len(df)
    n_anom = max(1, int(n * ratio))

    df = df.copy()
    str_cols = [c for c in df.columns if df[c].dtype == object]

    for _ in range(n_anom):
        idx  = random.randint(0, n - 1)
        kind = random.choice(types)

        if kind == "sql_injection" and str_cols:
            df.at[idx, random.choice(str_cols)] = random.choice(_SQL_PAYLOADS)

        elif kind == "xss" and str_cols:
            df.at[idx, random.choice(str_cols)] = random.choice(_XSS_PAYLOADS)

        elif kind == "invalid_jwt":
            jwt_cols = [c for c in str_cols
                        if any(kw in c.lower() for kw in ("token", "jwt", "auth", "bearer"))]
            col = jwt_cols[0] if jwt_cols else (str_cols[0] if str_cols else None)
            if col:
                df.at[idx, col] = random.choice(_INVALID_JWTS)

        elif kind == "brute_force":
            _inject_brute_force(df, idx)

        elif kind == "port_scan":
            _inject_port_scan(df, idx)

        elif kind == "impossible_timestamp":
            _inject_impossible_ts(df, idx)

        _mark_anomaly(df, idx)

    return df
