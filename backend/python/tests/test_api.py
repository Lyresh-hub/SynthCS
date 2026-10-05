# =============================================================================
# Automatic tests for the Python service (run on every push by GitHub Actions)
# =============================================================================
# Run locally from backend/python:   python -m pytest tests -q
#
# The login check (Node) and the daily quota are replaced with stand-ins, and
# every test works in its own temporary datasets folder, so nothing real is touched.
# =============================================================================

import io
import json
import os
import sys
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main  # noqa: E402
from dataset_importer import process_uploaded_file  # noqa: E402
from generator import _keep_in_real_range  # noqa: E402

QA_FILES = os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "qa-test-files")
AUTH = {"Authorization": "Bearer test"}


@pytest.fixture
def user():
    return {"id": "test-user", "role": "student", "privacy_mode": False}


@pytest.fixture
def client(tmp_path, monkeypatch, user):
    monkeypatch.setattr(main, "DATASETS_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_caller", lambda authorization: user)
    monkeypatch.setattr(main, "_require_quota", lambda authorization: None)
    return TestClient(main.app, raise_server_exceptions=False)


def upload(client, name, content):
    return client.post("/api/upload-dataset", files={"file": (name, content, "text/csv")}, headers=AUTH)


def qa_file(name):
    with open(os.path.join(QA_FILES, name), "rb") as f:
        return f.read()


# ── Security ─────────────────────────────────────────────────────────────────

def test_table_name_cannot_write_outside_the_dataset_folder(client, tmp_path):
    tables = [{"name": "../../evil_ci_test", "row_count": 5,
               "fields": [{"name": "a_id", "field_type": "integer", "is_pk": True}]}]
    r = client.post("/api/generate-multi-table", json={"tables": tables}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["table_names"] == ["evil_ci_test"]
    assert not os.path.exists(os.path.join(str(tmp_path), "..", "..", "evil_ci_test.csv"))


def test_other_users_cannot_read_a_dataset(client, user):
    r = upload(client, "grades.csv", b"id,score\n" + b"".join(f"{i},{i % 100}\n".encode() for i in range(20)))
    dataset_id = r.json()["dataset_id"]
    user["id"] = "someone-else"
    r = client.get(f"/api/preview/{dataset_id}", headers=AUTH)
    assert r.status_code == 403


# ── Length limits ────────────────────────────────────────────────────────────

def test_long_search_text_gets_a_clear_message(client):
    r = client.post("/api/kaggle/search", json={"query": "credit " * 2000}, headers=AUTH)
    assert r.status_code == 400
    assert "too long" in r.json()["detail"]


def test_long_table_name_gets_a_clear_message(client):
    r = client.post("/api/generate-from-schema", headers=AUTH,
                    json={"table_name": "x" * 500, "fields": [{"name": "a", "field_type": "integer"}]})
    assert r.status_code == 400
    assert "table name is too long" in r.json()["detail"]


# ── Uploads (files in docs/qa-test-files) ────────────────────────────────────

@pytest.mark.parametrize("name, expected", [
    ("empty.csv", "empty"),
    ("headers_only.csv", "no data rows"),
    ("image_renamed.csv", "PNG image"),
    ("corrupt_binary.csv", "binary data"),
])
def test_bad_files_are_refused_with_a_clear_message(client, name, expected):
    r = upload(client, name, qa_file(name))
    assert r.status_code == 400
    assert expected in r.json()["detail"]


def test_utf16_file_is_read_correctly(client):
    r = upload(client, "utf16_encoded.csv", qa_file("utf16_encoded.csv"))
    assert r.status_code == 200
    assert [c["name"] for c in r.json()["schema"]] == ["student_id", "name", "age", "gpa"]


def test_empty_columns_are_reported(client):
    r = upload(client, "empty_column.csv", qa_file("empty_column.csv"))
    assert r.status_code == 200
    assert any("empty column" in n for n in r.json()["notes"])


def test_huge_upload_is_refused(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 1024)
    r = upload(client, "big.csv", b"id\n" + b"1\n" * 2000)
    assert r.status_code == 413


def test_ctgan_needs_at_least_ten_rows(client):
    r = upload(client, "one_row.csv", qa_file("one_row.csv"))
    assert any("at least 10" in n for n in r.json()["notes"])
    schema = r.json()["schema"]
    changes = [{"original_name": c["name"], "new_name": c["name"], "original_type": c["type"],
                "new_type": c["type"], "nullable": False} for c in schema]
    r = client.post("/api/generate", headers=AUTH,
                    json={"dataset_id": r.json()["dataset_id"], "changes": changes, "row_count": 1000})
    assert r.status_code == 400
    assert "at least 10" in r.json()["detail"]


def test_upload_notes_for_small_files_directly(tmp_path):
    _, _, notes = process_uploaded_file(b"a,b\n1,2\n3,4\n", "small.csv", str(tmp_path))
    assert any("Only 2 data rows" in n for n in notes)


# ── Generated values stay realistic ──────────────────────────────────────────

def test_synthetic_numbers_stay_inside_the_real_range():
    real = pd.DataFrame({"age": [18, 20, 25], "gpa": [1.0, 2.5, 4.0], "course": ["A", "B", "C"]})
    fake = pd.DataFrame({"age": [12.4, 30.7, 21.2], "gpa": [-1.0, 5.3, 3.3], "course": ["A", "B", "Z"]})
    out = _keep_in_real_range(fake, real)
    assert out["age"].tolist() == [18, 25, 21]
    assert out["gpa"].between(1.0, 4.0).all()
    assert out["course"].tolist() == ["A", "B", "Z"]   # text columns untouched


# ── Retention (30 days, or 24 hours with Privacy Mode) ───────────────────────

def test_privacy_mode_datasets_expire_after_24_hours(client, user, tmp_path):
    user["privacy_mode"] = True
    dataset_id = upload(client, "p.csv", b"id,score\n1,2\n3,4\n").json()["dataset_id"]
    owner = json.load(open(os.path.join(str(tmp_path), dataset_id, "owner.json")))
    assert round((owner["expires_at"] - time.time()) / 3600) == 24


def test_cleanup_deletes_only_expired_folders(client, tmp_path):
    keep = upload(client, "a.csv", b"id\n1\n2\n").json()["dataset_id"]
    old = upload(client, "b.csv", b"id\n1\n2\n").json()["dataset_id"]
    owner_file = os.path.join(str(tmp_path), old, "owner.json")
    owner = json.load(open(owner_file))
    owner["expires_at"] = time.time() - 1
    json.dump(owner, open(owner_file, "w"))
    assert main._cleanup_expired_datasets() == 1
    assert os.path.isdir(os.path.join(str(tmp_path), keep))
    assert not os.path.exists(os.path.join(str(tmp_path), old))
