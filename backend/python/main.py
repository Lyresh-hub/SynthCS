import os
import uuid
from typing import Any
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Load Kaggle credentials from the local .env before anything else
load_dotenv(Path(__file__).parent / ".env")

from kaggle_service import search_datasets, download_dataset
from analyzer import analyze_dataset
from generator import generate_synthetic_data, expand_template_with_ctgan

app = FastAPI(title="SynthCS Python Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASETS_DIR = os.path.join(os.path.dirname(__file__), "temp_datasets")
os.makedirs(DATASETS_DIR, exist_ok=True)


# ── Request / Response models ────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str


class DownloadRequest(BaseModel):
    dataset_ref: str  # Kaggle "owner/dataset-name"


class FieldChange(BaseModel):
    original_name: str
    new_name: str
    original_type: str
    new_type: str
    nullable: bool


class GenerateRequest(BaseModel):
    dataset_id: str
    changes: list[FieldChange]
    row_count: int


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "SynthCS Python service is running"}


@app.post("/api/kaggle/search")
def kaggle_search(req: SearchRequest) -> dict[str, Any]:
    """Search Kaggle and return up to 10 matching datasets."""
    try:
        results = search_datasets(req.query)
        return {"datasets": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/kaggle/download")
def kaggle_download(req: DownloadRequest) -> dict[str, Any]:
    """
    Download a Kaggle dataset, analyze its schema, and return:
    - dataset_id  (use this in /api/generate)
    - schema      (list of {name, type, nullable, sample_values})
    """
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)

    csv_path = download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found or no CSV file in archive."
        )

    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")

    return {
        "dataset_id": dataset_id,
        "csv_file": os.path.basename(csv_path),
        "schema": schema,
    }


@app.post("/api/generate")
def generate(req: GenerateRequest):
    """
    Train CTGAN on the downloaded dataset and generate synthetic rows.
    Only the changes the user specified are applied to the output — nothing else.
    Returns a CSV file as a download.
    """
    dataset_path = os.path.join(DATASETS_DIR, req.dataset_id)
    if not os.path.isdir(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found. Please download it first.")

    if not (1_000 <= req.row_count <= 100_000):
        raise HTTPException(status_code=400, detail="row_count must be between 1000 and 100000.")

    changes = [c.model_dump() for c in req.changes]

    try:
        output_path = generate_synthetic_data(
            dataset_path=dataset_path,
            changes=changes,
            row_count=req.row_count,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    return FileResponse(
        path=output_path,
        media_type="text/csv",
        filename=f"synthetic_{req.dataset_id[:8]}.csv",
    )


@app.get("/api/preview/{dataset_id}")
def preview_dataset(dataset_id: str, limit: int = 100):
    """Return the first `limit` rows of a generated CSV as JSON for in-app preview."""
    output_path = os.path.join(DATASETS_DIR, dataset_id, "synthetic_output.csv")
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="File not found or already expired.")

    import pandas as pd

    df = pd.read_csv(output_path, nrows=limit)

    # Count total rows efficiently (header counts as 1 line)
    with open(output_path, "r", encoding="utf-8", errors="replace") as f:
        total_rows = sum(1 for _ in f) - 1

    # Replace NaN with None so JSON serialisation produces null
    rows = df.where(df.notna(), None).to_dict(orient="records")

    return {
        "columns": df.columns.tolist(),
        "rows": rows,
        "total_rows": total_rows,
        "preview_rows": len(df),
    }


class FieldConstraints(BaseModel):
    min_val:      float | None = None
    max_val:      float | None = None
    distribution: str          = "uniform"   # uniform | normal | skewed
    enum_values:  list[str]    = []
    cardinality:  int | None   = None
    date_from:    str | None   = None        # YYYY-MM-DD
    date_to:      str | None   = None
    true_ratio:   float        = 0.5         # for boolean
    null_rate:    float        = 0.0         # 0–50 %


class SchemaField(BaseModel):
    name:        str
    field_type:  str
    nullable:    bool              = False
    description: str               = ""
    constraints: FieldConstraints  = FieldConstraints()


class SchemaGenerateRequest(BaseModel):
    table_name: str
    fields:     list[SchemaField]


class ExpandRequest(BaseModel):
    dataset_id: str
    row_count:  int


_TEMPLATE_ROWS = 200


@app.post("/api/generate-from-schema")
def generate_from_schema(req: SchemaGenerateRequest):
    """
    Generate a 200-row faker template from a schema definition.
    Returns the dataset_id plus a JSON preview so the frontend can show it
    before the user decides how many rows to expand to via CTGAN.
    """
    import pandas as pd
    import numpy as np
    import uuid as uuid_module
    import random
    import string
    from datetime import datetime, timedelta

    FIRST   = ["Alice","Bob","Carlos","Diana","Eve","Frank","Grace","Henry","Iris","Jack","Karen","Leo","Maria","Nathan","Oliver","Priya","Quinn","Rachel","Samuel","Tina"]
    LAST    = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Davis","Miller","Wilson","Moore","Taylor","Anderson","Martinez","Lee","Thompson","White","Harris","Clark"]
    STREETS = ["Main St","Oak Ave","Pine Rd","Elm St","Cedar Ln","Maple Dr","River Rd","Park Blvd","Sunset Blvd","Lake Dr"]
    DOMAINS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","proton.me"]

    # Keyword-based data pools for smart string generation
    _POOLS: dict[str, list[str]] = {
        "country":    ["United States","Philippines","Canada","Germany","Japan","Australia","Brazil","India","France","United Kingdom","Mexico","South Korea","Italy","Spain","Netherlands"],
        "city":       ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
        "city_from":  ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
        "city_to":    ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
        "state":      ["California","Texas","Florida","New York","Illinois","Pennsylvania","Ohio","Georgia","North Carolina","Michigan","Metro Manila","Cebu","Davao"],
        "province":   ["California","Texas","Florida","New York","Illinois","Pennsylvania","Ohio","Georgia","Metro Manila","Cebu","Davao","Laguna","Batangas"],
        "region":     ["North America","Europe","Asia Pacific","Latin America","Middle East","Africa","Southeast Asia","South Asia"],
        "department": ["Engineering","Marketing","Sales","Human Resources","Finance","Operations","Product","Legal","Customer Support","Research & Development"],
        "dept":       ["Engineering","Marketing","Sales","Human Resources","Finance","Operations","Product","Legal","Customer Support","Research & Development"],
        "protocol":   ["TCP","UDP","HTTP","HTTPS","FTP","SSH","DNS","ICMP","SMTP","RDP","SMB","TLS"],
        "attack":     ["SQL Injection","XSS","DDoS","Phishing","Brute Force","Man-in-the-Middle","Ransomware","Zero-Day","Port Scan","Credential Stuffing"],
        "threat":     ["Malware","Ransomware","Phishing","Insider Threat","APT","DDoS","SQL Injection","Data Exfiltration","Credential Theft","Zero-Day Exploit"],
        "severity":   ["Low","Medium","High","Critical"],
        "level":      ["Low","Medium","High","Critical"],
        "priority":   ["Low","Medium","High","Urgent"],
        "status":     ["Active","Inactive","Pending","Completed","Cancelled","In Progress","On Hold","Resolved"],
        "stage":      ["Draft","Review","Approved","Published","Archived","In Progress","Completed"],
        "grade":      ["A","B","C","D","F"],
        "category":   ["Category A","Category B","Category C","Category D"],
        "type":       ["Type A","Type B","Type C","Type D"],
        "gender":     ["Male","Female","Non-binary","Prefer not to say"],
        "sex":        ["Male","Female"],
        "marital":    ["Single","Married","Divorced","Widowed"],
        "platform":   ["Windows","macOS","Linux","Android","iOS","Ubuntu","CentOS"],
        "os":         ["Windows 11","Windows 10","macOS Ventura","Ubuntu 22.04","Android 14","iOS 17","CentOS 8"],
        "browser":    ["Chrome","Firefox","Safari","Edge","Opera","Brave"],
        "device":     ["Desktop","Laptop","Smartphone","Tablet","Server","IoT Device"],
        "diagnosis":  ["Hypertension","Diabetes Type 2","Asthma","Pneumonia","COVID-19","Appendicitis","Migraine","Anxiety Disorder","Fracture","Anemia"],
        "condition":  ["Stable","Critical","Improving","Deteriorating","Under Observation"],
        "disease":    ["Hypertension","Diabetes","Asthma","Tuberculosis","COVID-19","Dengue","Malaria","Cancer","Heart Disease","Stroke"],
        "treatment":  ["Surgery","Chemotherapy","Physical Therapy","Medication","Observation","Dialysis","Radiation","Immunotherapy","Vaccination","Rest"],
        "medication": ["Paracetamol","Amoxicillin","Ibuprofen","Metformin","Lisinopril","Atorvastatin","Omeprazole","Amlodipine","Azithromycin","Prednisone"],
        "occupation": ["Engineer","Doctor","Teacher","Nurse","Accountant","Lawyer","Developer","Designer","Manager","Analyst"],
        "job":        ["Engineer","Doctor","Teacher","Nurse","Accountant","Lawyer","Developer","Designer","Manager","Analyst"],
        "role":       ["Admin","User","Manager","Analyst","Developer","Designer","Viewer","Editor","Owner","Guest"],
        "airline":    ["Philippine Airlines","Cebu Pacific","AirAsia","Delta","United","American Airlines","Emirates","Singapore Airlines","Cathay Pacific","Qatar Airways"],
        "flight":     [f"{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=2))}{random.randint(100,9999)}" for _ in range(20)],
        "airport":    ["NAIA","Mactan-Cebu","Clark","Los Angeles (LAX)","New York (JFK)","London (LHR)","Tokyo (NRT)","Sydney (SYD)","Dubai (DXB)","Singapore (SIN)"],
        "product":    ["Product A","Product B","Product C","Product D","Product E","Widget X","Widget Y","Service Pack 1","Premium Plan","Basic Plan"],
        "plan":       ["Free","Basic","Pro","Enterprise","Starter","Business","Ultimate"],
        "currency":   ["USD","EUR","GBP","JPY","PHP","AUD","CAD","SGD","CNY","KRW"],
        "language":   ["English","Spanish","French","German","Japanese","Mandarin","Filipino","Portuguese","Arabic","Korean"],
        "color":      ["Red","Blue","Green","Yellow","Orange","Purple","Black","White","Gray","Brown"],
        "size":       ["XS","S","M","L","XL","XXL"],
        "education":  ["High School","Bachelor's Degree","Master's Degree","PhD","Associate Degree","Vocational","Some College"],
        "degree":     ["High School","Bachelor's","Master's","PhD","Associate","Vocational"],
        "action":     ["Login","Logout","Create","Update","Delete","View","Download","Upload","Share","Export"],
        "event":      ["Login","Logout","Purchase","Signup","Click","View","Download","Error","Warning","Info"],
        "log":        ["INFO: Request processed","WARNING: High memory usage","ERROR: Connection timeout","DEBUG: Query executed","INFO: User authenticated","ERROR: Invalid token","WARNING: Rate limit exceeded"],
        "note":       ["Follow up required","No issues found","Escalated to manager","Resolved successfully","Awaiting customer response","Under review","Completed as requested","Needs further investigation"],
        "comment":    ["Looks good","Needs revision","Approved","Rejected","Under review","Please clarify","Well done","Requires more detail"],
        "remark":     ["Satisfactory","Needs improvement","Excellent","Good","Average","Below average","Outstanding","Meets expectations"],
        "feedback":   ["Very satisfied","Satisfied","Neutral","Dissatisfied","Very dissatisfied","Great service","Could be better","Excellent experience"],
        "description":["Standard configuration","Custom setup","Default settings","Advanced configuration","Minimal setup","Full installation","Partial deployment"],
        "tag":        ["urgent","important","low-priority","follow-up","escalated","new","resolved","archived","flagged","reviewed"],
        "label":      ["urgent","important","low-priority","follow-up","escalated","new","resolved","archived","flagged","reviewed"],
    }

    def _keyword_pool(field_name: str, description: str) -> list[str] | None:
        hint = (field_name + " " + description).lower().replace("_", " ")
        for key, pool in _POOLS.items():
            if key in hint:
                return pool
        return None

    def gen_col(ftype: str, n: int, c: FieldConstraints, field_name: str = "", description: str = ""):
        null_mask = np.random.random(n) < (min(c.null_rate, 50.0) / 100.0)

        if ftype == "integer":
            lo = int(c.min_val) if c.min_val is not None else 1
            hi = int(c.max_val) if c.max_val is not None else 10_000
            if hi <= lo: hi = lo + 1
            if c.distribution == "normal":
                mean, std = (lo + hi) / 2, (hi - lo) / 6
                data = np.clip(np.random.normal(mean, std, n), lo, hi).astype(int).astype(object)
            elif c.distribution == "skewed":
                data = np.clip(np.random.exponential((hi - lo) / 4, n) + lo, lo, hi).astype(int).astype(object)
            else:
                data = np.random.randint(lo, hi + 1, n).astype(object)

        elif ftype == "float":
            lo = float(c.min_val) if c.min_val is not None else 0.0
            hi = float(c.max_val) if c.max_val is not None else 1_000.0
            if hi <= lo: hi = lo + 1.0
            if c.distribution == "normal":
                mean, std = (lo + hi) / 2, (hi - lo) / 6
                data = np.round(np.clip(np.random.normal(mean, std, n), lo, hi), 2).astype(object)
            elif c.distribution == "skewed":
                data = np.round(np.clip(np.random.exponential((hi - lo) / 4, n) + lo, lo, hi), 2).astype(object)
            else:
                data = np.round(np.random.uniform(lo, hi, n), 2).astype(object)

        elif ftype == "string":
            if c.enum_values:
                data = np.random.choice(c.enum_values, n).astype(object)
            else:
                smart_pool = _keyword_pool(field_name, description)
                if smart_pool:
                    data = np.random.choice(smart_pool, n).astype(object)
                else:
                    k = max(1, c.cardinality or 50)
                    pool = ["".join(random.choices(string.ascii_lowercase, k=random.randint(4, 10)))
                            for _ in range(min(k, 5_000))]
                    data = np.random.choice(pool, n).astype(object)

        elif ftype == "boolean":
            r = max(0.0, min(1.0, c.true_ratio))
            data = np.random.choice([True, False], n, p=[r, 1 - r]).astype(object)

        elif ftype == "date":
            try:
                d_from = datetime.strptime(c.date_from, "%Y-%m-%d") if c.date_from else datetime(2015, 1, 1)
            except ValueError:
                d_from = datetime(2015, 1, 1)
            try:
                d_to = datetime.strptime(c.date_to, "%Y-%m-%d") if c.date_to else datetime(2024, 12, 31)
            except ValueError:
                d_to = datetime(2024, 12, 31)
            delta = max(1, (d_to - d_from).days)
            data = np.array([(d_from + timedelta(days=int(d))).strftime("%Y-%m-%d")
                             for d in np.random.randint(0, delta, n)], dtype=object)

        elif ftype == "email":
            data = np.array([f"user{i}@{random.choice(DOMAINS)}" for i in range(n)], dtype=object)
        elif ftype == "uuid":
            data = np.array([str(uuid_module.uuid4()) for _ in range(n)], dtype=object)
        elif ftype == "phone":
            data = np.array([f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
                             for _ in range(n)], dtype=object)
        elif ftype == "address":
            data = np.array([f"{random.randint(1,999)} {random.choice(STREETS)}" for _ in range(n)], dtype=object)
        elif ftype == "name":
            data = np.array([f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)], dtype=object)
        elif ftype == "ip":
            data = np.array([
                f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
                for _ in range(n)], dtype=object)
        else:
            data = np.array(["".join(random.choices(string.ascii_lowercase, k=random.randint(4, 10)))
                             for _ in range(n)], dtype=object)

        data[null_mask] = None
        return data

    import uuid as uuid_module
    df = pd.DataFrame({f.name: gen_col(f.field_type, _TEMPLATE_ROWS, f.constraints, f.name, f.description) for f in req.fields})

    dataset_id = str(uuid_module.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)

    # Save as template.csv — CTGAN will train on this later
    template_path = os.path.join(dest, "template.csv")
    df.to_csv(template_path, index=False)

    # Return preview rows so the frontend can show them before expansion
    preview_df = df.head(20)
    preview_rows = preview_df.where(preview_df.notna(), None).to_dict(orient="records")

    return {
        "dataset_id":    dataset_id,
        "template_rows": _TEMPLATE_ROWS,
        "columns":       df.columns.tolist(),
        "preview":       preview_rows,
    }


@app.post("/api/expand-with-ctgan")
def expand_with_ctgan(req: ExpandRequest):
    """Train CTGAN on the 200-row template and scale up to req.row_count rows."""
    dataset_path = os.path.join(DATASETS_DIR, req.dataset_id)
    if not os.path.isdir(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if not (1_000 <= req.row_count <= 100_000):
        raise HTTPException(status_code=400, detail="row_count must be between 1,000 and 100,000.")

    try:
        expand_template_with_ctgan(dataset_path, req.row_count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CTGAN expansion failed: {e}")

    return {"dataset_id": req.dataset_id}


@app.get("/api/validate/{dataset_id}")
def validate_dataset(dataset_id: str):
    """Compare original vs synthetic data using Wasserstein, Correlation, and ML Utility metrics."""
    dataset_path = os.path.join(DATASETS_DIR, dataset_id)
    if not os.path.isdir(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    synthetic_path = os.path.join(dataset_path, "synthetic_output.csv")
    if not os.path.exists(synthetic_path):
        raise HTTPException(status_code=404, detail="Synthetic output not found.")

    # Priority: held-out test set (Kaggle flow) → template.csv (LLM flow) → any other CSV
    test_set_path  = os.path.join(dataset_path, "test_set.csv")
    template_path  = os.path.join(dataset_path, "template.csv")

    if os.path.exists(test_set_path):
        original_path = test_set_path          # Kaggle: 20% held-out split
    elif os.path.exists(template_path):
        original_path = template_path          # LLM: 200-row faker template
    else:
        original_path = None
        for f in sorted(os.listdir(dataset_path)):
            if f.endswith(".csv") and f != "synthetic_output.csv":
                original_path = os.path.join(dataset_path, f)
                break

    if not original_path:
        raise HTTPException(status_code=404, detail="Original dataset not found.")

    import pandas as pd
    import numpy as np
    from scipy.stats import wasserstein_distance
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import LabelEncoder

    real  = pd.read_csv(original_path)
    synth = pd.read_csv(synthetic_path)

    common_cols  = [c for c in real.columns if c in synth.columns]
    real  = real[common_cols]
    synth = synth[common_cols]

    # ── 1. Wasserstein Distance ──────────────────────────────────────────────
    numeric_cols = real.select_dtypes(include=[np.number]).columns.tolist()
    per_column: dict[str, float] = {}
    wass_scores: list[float] = []

    for col in numeric_cols:
        r = real[col].dropna().values
        s = synth[col].dropna().values
        if len(r) == 0 or len(s) == 0:
            continue
        std = r.std()
        score = 1.0 if std == 0 else 1.0 / (1.0 + wasserstein_distance(r, s) / std)
        per_column[col] = round(score * 100, 1)
        wass_scores.append(score)

    wasserstein_score = float(np.mean(wass_scores)) if wass_scores else 0.5

    # ── 2. Correlation Difference ────────────────────────────────────────────
    if len(numeric_cols) >= 2:
        real_corr  = real[numeric_cols].corr().fillna(0).values
        synth_corr = synth[numeric_cols].corr().fillna(0).values
        corr_diff  = float(np.mean(np.abs(real_corr - synth_corr)))
        correlation_score = max(0.0, 1.0 - corr_diff)
    else:
        correlation_score = 0.5

    # ── 3. ML Utility – Train on Synthetic, Test on Real ────────────────────
    try:
        def _prepare(df: "pd.DataFrame") -> "pd.DataFrame":
            df = df.copy()
            for c in df.select_dtypes(include=["object"]).columns:
                le = LabelEncoder()
                df[c] = le.fit_transform(df[c].astype(str))
            return df.fillna(df.median(numeric_only=True))

        if len(common_cols) >= 2:
            target     = common_cols[-1]
            features   = [c for c in common_cols if c != target]
            real_ml    = _prepare(real)
            synth_ml   = _prepare(synth)

            X_real, y_real   = real_ml[features].values,  real_ml[target].values
            X_synth, y_synth = synth_ml[features].values, synth_ml[target].values

            clf_tstr = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
            clf_tstr.fit(X_synth, y_synth)
            tstr = clf_tstr.score(X_real, y_real)

            clf_trtr = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
            clf_trtr.fit(X_real, y_real)
            trtr = clf_trtr.score(X_real, y_real)

            utility_score = min(1.0, tstr / trtr) if trtr > 0 else 0.5
        else:
            utility_score = 0.5
    except Exception:
        utility_score = 0.5

    # ── Overall ──────────────────────────────────────────────────────────────
    overall_pct = round((0.4 * wasserstein_score + 0.4 * correlation_score + 0.2 * utility_score) * 100, 1)
    status = "Good" if overall_pct >= 75 else ("Acceptable" if overall_pct >= 50 else "Poor")

    return {
        "overall_score": overall_pct,
        "status": status,
        "metrics": {
            "wasserstein": {
                "score": round(wasserstein_score * 100, 1),
                "label": "Distribution Similarity",
                "per_column": per_column,
            },
            "correlation": {
                "score": round(correlation_score * 100, 1),
                "label": "Correlation Preservation",
            },
            "utility": {
                "score": round(utility_score * 100, 1),
                "label": "ML Utility (TSTR)",
            },
        },
    }


@app.get("/api/download/{dataset_id}")
def download_saved(dataset_id: str):
    """Serve a previously generated CSV file by dataset_id."""
    output_path = os.path.join(DATASETS_DIR, dataset_id, "synthetic_output.csv")
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="File not found or already expired.")
    return FileResponse(
        path=output_path,
        media_type="text/csv",
        filename=f"synthetic_{dataset_id[:8]}.csv",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
