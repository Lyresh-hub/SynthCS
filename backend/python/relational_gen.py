"""
Relational dataset generator.

Build master entity tables FIRST, then generate transaction / enrollment rows
that reference them consistently.

Fixes:
    • Email is derived from the same entity's name (no more "James King / noahconstantino@...")
    • FK-only fields (e.g. professor_id alone) still get a consistent pool of IDs
    • Separate entity CSVs are saved to disk and returned for multi-table preview
    • Inventory state machine: Purchase → stock+, Sale → stock-
"""
from __future__ import annotations

import random
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd

from smart_gen_data import gen_col, FIRST, LAST, DOMAINS


# ── Name helpers ──────────────────────────────────────────────────────────────

def _random_full_name() -> str:
    return f"{random.choice(FIRST)} {random.choice(LAST)}"


def _email_from_name(name: str) -> str:
    parts = str(name).lower().split()
    first = parts[0] if parts else "user"
    last  = parts[-1] if len(parts) > 1 else "x"
    sep   = random.choice([".", "_", ""])
    num   = str(random.randint(1, 99)) if random.random() < 0.35 else ""
    return f"{first}{sep}{last}{num}@{random.choice(DOMAINS)}"


# ── Entity prefix detection ───────────────────────────────────────────────────

def _detect_entity_prefixes(field_names: list[str]) -> dict[str, list[str]]:
    """
    Return {prefix: [field_names]} for every prefix that appears in ≥2 fields
    OR appears in exactly 1 field that ends with _id / _code / _ref
    (those are FK-only references and still need consistent pools).
    """
    groups: dict[str, list[str]] = defaultdict(list)
    for name in field_names:
        parts = name.split("_")
        if len(parts) >= 2:
            groups[parts[0]].append(name)

    result: dict[str, list[str]] = {}
    for prefix, names in groups.items():
        if len(names) >= 2:
            result[prefix] = names          # full entity group
        elif len(names) == 1:
            fn = names[0]
            if fn.endswith("_id") or fn.endswith("_code") or fn.endswith("_ref"):
                result[prefix] = names      # FK-only reference
    return result


# ── Master entity table builder ───────────────────────────────────────────────

def _build_entity_lookup(
    prefix: str,
    group_fields: list[Any],
    n_entities: int,
    save_dir: str | None = None,
) -> tuple[list[dict], pd.DataFrame | None]:
    """
    Generate n_entities records for one entity type.

    Returns:
        records  – list of dicts, one per entity (used for FK sampling)
        ext_df   – a DataFrame with extra columns (e.g. professor_name added
                   automatically for FK-only professor_id fields); None if the
                   entity group already has a name column.
    """
    is_fk_only = len(group_fields) == 1 and (
        group_fields[0].name.endswith("_id")
        or group_fields[0].name.endswith("_code")
        or group_fields[0].name.endswith("_ref")
    )

    # ── FK-only: build a minimal master with ID + name (+ email if person) ──
    if is_fk_only:
        id_field = group_fields[0]
        ids: list[str] = []
        names: list[str] = []
        emails: list[str] = []

        # Determine whether this entity is a person or an object
        person_prefixes = {"student", "professor", "teacher", "employee", "staff",
                           "customer", "user", "person", "patient", "doctor", "nurse",
                           "faculty", "instructor", "advisor", "guardian", "parent"}
        is_person = prefix.lower() in person_prefixes

        for i in range(n_entities):
            # Generate ID
            if id_field.field_type == "uuid":
                import uuid as _uuid
                ids.append(str(_uuid.uuid4()))
            elif prefix.lower() == "student":
                # Cohort-style IDs: 2020-000001 spread across enrollment years
                cohort_years = [2020, 2021, 2022, 2023, 2024]
                year = cohort_years[i % len(cohort_years)]
                ids.append(f"{year}-{str(i // len(cohort_years) + 1).zfill(6)}")
            else:
                ids.append(f"{prefix.upper()[:3]}{str(i + 1).zfill(3)}")

            if is_person:
                name = _random_full_name()
                names.append(name)
                emails.append(_email_from_name(name))
            else:
                # Use pool-based name for objects
                from smart_gen_data import _keyword_pool
                pool = _keyword_pool(f"{prefix}_name", f"{prefix} name")
                names.append(
                    random.choice(pool) if pool
                    else f"{prefix.title()} {str(i + 1).zfill(2)}"
                )

        id_col   = id_field.name
        name_col = f"{prefix}_name"
        records: list[dict] = [{id_col: ids[i], name_col: names[i]} for i in range(n_entities)]
        if is_person:
            email_col = f"{prefix}_email"
            for i, r in enumerate(records):
                r[email_col] = emails[i]

        ext_df = pd.DataFrame(records)
        return records, ext_df

    # ── Full entity: generate all columns, then fix email ── ─────────────────
    col_arrays: dict[str, np.ndarray] = {}
    for f in group_fields:
        col_arrays[f.name] = gen_col(
            f.field_type, n_entities, f.constraints, f.name, f.description
        )

    # Make ID field unique / sequential
    for f in group_fields:
        fn = f.name.lower()
        if fn.endswith("_id") or fn == f"{prefix}_id":
            if f.field_type != "uuid":
                if prefix.lower() == "student":
                    cohort_years = [2020, 2021, 2022, 2023, 2024]
                    col_arrays[f.name] = np.array(
                        [f"{cohort_years[i % len(cohort_years)]}-{str(i // len(cohort_years) + 1).zfill(6)}"
                         for i in range(n_entities)],
                        dtype=object,
                    )
                else:
                    col_arrays[f.name] = np.array(
                        [f"{prefix.upper()[:3]}{str(i + 1).zfill(3)}"
                         for i in range(n_entities)],
                        dtype=object,
                    )
            break

    # Fix email-name consistency within the same entity
    name_field_name  = next(
        (f.name for f in group_fields if "name" in f.name.lower()
         and "email" not in f.name.lower()
         and not f.name.lower().endswith("_id")),
        None,
    )
    email_field_name = next(
        (f.name for f in group_fields if "email" in f.name.lower()), None
    )
    if name_field_name and email_field_name:
        col_arrays[email_field_name] = np.array(
            [_email_from_name(col_arrays[name_field_name][i]) for i in range(n_entities)],
            dtype=object,
        )

    df      = pd.DataFrame(col_arrays)
    records = df.to_dict(orient="records")
    return records, None   # no extra table for full entities


# ── Inventory state machine ───────────────────────────────────────────────────

def _find_col(df: pd.DataFrame, keywords: tuple[str, ...]) -> str | None:
    for col in df.columns:
        lc = col.lower()
        if any(kw in lc for kw in keywords):
            return col
    return None


def _apply_inventory_state(df: pd.DataFrame) -> pd.DataFrame:
    txn_col = _find_col(df, ("transaction_type", "movement_type", "operation_type",
                              "txn_type", "stock_movement"))
    qty_col = _find_col(df, ("quantity", "qty", "units_sold", "units_purchased", "units"))
    sa_col  = _find_col(df, ("stock_after", "quantity_on_hand", "current_stock",
                              "closing_stock", "on_hand", "available"))
    sb_col  = _find_col(df, ("stock_before", "opening_stock", "beginning_stock"))
    dt_col  = _find_col(df, ("date", "timestamp", "created_at", "transaction_date",
                              "movement_date"))
    pid_col = _find_col(df, ("product_id", "item_id", "prod_id", "sku_id"))

    if not txn_col or not qty_col or not sa_col:
        return df

    df = df.copy()
    if dt_col:
        try:
            df = df.sort_values(dt_col).reset_index(drop=True)
        except Exception:
            pass

    INC = ("purchase", "receipt", "receive", "restock", "return",
           "add", "transfer in", "arrival", "reorder")
    DEC = ("sale", "sell", "sold", "issue", "dispatch", "damage",
           "loss", "write", "disposal", "transfer out", "damaged")

    tracker: dict[Any, int] = {}
    sa_vals: list[int] = []
    sb_vals: list[int] = []

    for _, row in df.iterrows():
        pid     = row[pid_col] if pid_col else "_"
        current = tracker.get(pid, 200)
        qty     = max(1, int(row[qty_col]) if pd.notna(row[qty_col]) else 1)
        txn     = str(row[txn_col]).lower()

        sb_vals.append(current)
        if any(k in txn for k in INC):
            current = min(current + qty, 9999)
        elif any(k in txn for k in DEC):
            qty     = min(qty, current)
            current = max(0, current - qty)
        tracker[pid] = current
        sa_vals.append(current)

    df[sa_col] = sa_vals
    if sb_col:
        df[sb_col] = sb_vals
    return df


# ── Email-name consistency (final pass on assembled DataFrame) ───────────────

def _fix_email_name_consistency(df: pd.DataFrame) -> pd.DataFrame:
    """Derive every *_email column from its matching *_name column."""
    name_cols  = [c for c in df.columns
                  if "name" in c.lower() and "email" not in c.lower()
                  and not c.lower().endswith("_id")]
    email_cols = [c for c in df.columns if "email" in c.lower()]
    if not email_cols or not name_cols:
        return df

    df = df.copy()
    for email_col in email_cols:
        ep = email_col.lower().replace("_email", "").replace("email", "")
        # Prefer prefix-matched name col, fall back to first name col
        matched = next(
            (nc for nc in name_cols if nc.lower().replace("_name", "").replace("name", "") == ep),
            name_cols[0],
        )
        df[email_col] = [_email_from_name(str(v)) for v in df[matched]]
    return df


# ── Grade ↔ Attendance correlation ───────────────────────────────────────────

def _apply_grade_attendance_correlation(df: pd.DataFrame) -> pd.DataFrame:
    att_col   = _find_col(df, ("attendance",))
    grade_col = _find_col(df, ("letter_grade", "final_grade", "grade"))
    if not att_col or not grade_col:
        return df

    df = df.copy()
    grades: list[str] = []
    for val in df[att_col]:
        try:
            att = float(val)
        except (TypeError, ValueError):
            grades.append(random.choice(["B", "C"]))
            continue
        if att >= 90:
            grades.append(random.choices(["A", "B", "C"],          weights=[50, 35, 15])[0])
        elif att >= 75:
            grades.append(random.choices(["A", "B", "C", "D"],     weights=[20, 45, 25, 10])[0])
        elif att >= 60:
            grades.append(random.choices(["B", "C", "D", "F"],     weights=[15, 40, 30, 15])[0])
        else:
            grades.append(random.choices(["C", "D", "F"],          weights=[20, 40, 40])[0])
    df[grade_col] = grades
    return df


# ── Professor → subject consistency ──────────────────────────────────────────

def _apply_professor_subject_consistency(df: pd.DataFrame) -> pd.DataFrame:
    prof_col = _find_col(df, ("professor_name", "professor_id",
                               "faculty_name", "faculty_id",
                               "teacher_name", "teacher_id",
                               "instructor_name", "instructor_id"))
    subj_col = _find_col(df, ("subject_name", "subject_id", "subject_code",
                               "course_name", "course_id", "course_code"))
    if not prof_col or not subj_col:
        return df

    professors = [p for p in df[prof_col].dropna().unique().tolist()]
    subjects   = [s for s in df[subj_col].dropna().unique().tolist()]
    if not professors or not subjects:
        return df

    # Assign ≤3 subjects per professor (circular distribution)
    n_each = max(1, min(3, len(subjects) // max(1, len(professors)) + 1))
    random.shuffle(subjects)
    prof_subjects: dict[Any, list] = {}
    for idx, prof in enumerate(professors):
        start = (idx * n_each) % len(subjects)
        prof_subjects[prof] = [subjects[(start + j) % len(subjects)] for j in range(n_each)]

    df = df.copy()
    df[subj_col] = [
        random.choice(prof_subjects.get(p, subjects))
        for p in df[prof_col]
    ]
    return df


# ── Schedule realism: same subject → same day + time ─────────────────────────

def _apply_schedule_consistency(df: pd.DataFrame) -> pd.DataFrame:
    subj_col = _find_col(df, ("subject_name", "subject_id", "subject_code",
                               "course_name", "course_id", "course_code"))
    day_col  = _find_col(df, ("day_of_week", "class_day", "schedule_day", "weekday"))
    time_col = _find_col(df, ("class_start_time", "start_time", "class_time", "time_slot"))
    if not subj_col or not (day_col or time_col):
        return df

    subjects = df[subj_col].dropna().unique().tolist()
    days  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    times = ["07:00", "08:00", "09:00", "10:00", "11:00",
             "13:00", "14:00", "15:00", "16:00", "17:00"]

    sched: dict[Any, dict] = {
        s: {"day": random.choice(days), "time": random.choice(times)}
        for s in subjects
    }

    df = df.copy()
    if day_col:
        df[day_col]  = [sched.get(s, {}).get("day",  random.choice(days))
                        for s in df[subj_col]]
    if time_col:
        df[time_col] = [sched.get(s, {}).get("time", random.choice(times))
                        for s in df[subj_col]]
    return df


# ── Main entry point ──────────────────────────────────────────────────────────

ENTITY_COUNTS = {
    "product": 30, "item": 30, "sku": 30,
    "supplier": 15, "vendor": 15, "manufacturer": 15,
    "warehouse": 5,  "customer": 50, "user": 50,
    "employee": 20, "staff": 20, "student": 100,
    "professor": 20, "teacher": 20, "faculty": 20,
    "instructor": 20, "subject": 30, "course": 30,
    "department": 10,
}
DEFAULT_ENTITY_COUNT = 20


def generate_relational_dataset(
    schema_fields: list[Any],
    n_rows: int,
    save_dir: str | None = None,
) -> tuple[pd.DataFrame, dict[str, pd.DataFrame]]:
    """
    Generate n_rows with FK consistency, email-name consistency,
    and inventory state tracking.

    Returns
    -------
    main_df       : the primary flat table
    entity_tables : {entity_name: DataFrame} — separate master tables
                    (saved to save_dir as <entity_name>.csv when save_dir given)
    """
    field_names   = [f.name for f in schema_fields]
    entity_groups = _detect_entity_prefixes(field_names)

    # Build master lookups
    lookups:      dict[str, list[dict]]  = {}
    entity_tables: dict[str, pd.DataFrame] = {}

    for prefix, names in entity_groups.items():
        group_fields = [f for f in schema_fields if f.name in names]
        n_ent = ENTITY_COUNTS.get(prefix, DEFAULT_ENTITY_COUNT)
        records, ext_df = _build_entity_lookup(prefix, group_fields, n_ent, save_dir)
        lookups[prefix] = records

        # For FK-only entities, save the auto-generated master table
        if ext_df is not None:
            entity_tables[prefix] = ext_df
            if save_dir:
                import os
                ext_df.to_csv(os.path.join(save_dir, f"{prefix}_master.csv"), index=False)

    # Field → entity prefix mapping
    field_to_prefix: dict[str, str] = {
        name: prefix
        for prefix, names in entity_groups.items()
        for name in names
    }

    # Independent fields (not in any entity group)
    independent = [f for f in schema_fields if f.name not in field_to_prefix]
    indep_arrays: dict[str, np.ndarray] = {
        f.name: gen_col(f.field_type, n_rows, f.constraints, f.name, f.description)
        for f in independent
    }

    # Entity columns: sample from master per row
    entity_cols: dict[str, list] = {
        f.name: [] for f in schema_fields if f.name in field_to_prefix
    }
    for _ in range(n_rows):
        row_entities = {p: random.choice(recs) for p, recs in lookups.items()}
        for f_name, prefix in field_to_prefix.items():
            entity_cols[f_name].append(row_entities[prefix][f_name])

    # Assemble in original schema order
    combined: dict[str, Any] = {}
    for f in schema_fields:
        combined[f.name] = (
            entity_cols[f.name] if f.name in entity_cols else list(indep_arrays[f.name])
        )

    main_df = pd.DataFrame(combined)
    main_df = _apply_inventory_state(main_df)
    main_df = _fix_email_name_consistency(main_df)
    main_df = _apply_professor_subject_consistency(main_df)
    main_df = _apply_schedule_consistency(main_df)
    main_df = _apply_grade_attendance_correlation(main_df)

    return main_df, entity_tables
