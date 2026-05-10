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
import huggingface_service
import uci_service
import openml_service
import datagov_ph_service
import psa_service
from smart_gen_data import gen_col

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


# ── Hugging Face ─────────────────────────────────────────────────────────────

@app.post("/api/huggingface/search")
def hf_search(req: SearchRequest) -> dict[str, Any]:
    try:
        return {"datasets": huggingface_service.search_datasets(req.query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/huggingface/download")
def hf_download(req: DownloadRequest) -> dict[str, Any]:
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    csv_path = huggingface_service.download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(status_code=404, detail="Could not download dataset from Hugging Face.")
    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")
    return {"dataset_id": dataset_id, "csv_file": os.path.basename(csv_path), "schema": schema}


# ── UCI ML Repository ─────────────────────────────────────────────────────────

@app.post("/api/uci/search")
def uci_search(req: SearchRequest) -> dict[str, Any]:
    try:
        return {"datasets": uci_service.search_datasets(req.query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/uci/download")
def uci_download(req: DownloadRequest) -> dict[str, Any]:
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    csv_path = uci_service.download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(status_code=404, detail="Could not download dataset from UCI.")
    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")
    return {"dataset_id": dataset_id, "csv_file": os.path.basename(csv_path), "schema": schema}


# ── OpenML ────────────────────────────────────────────────────────────────────

@app.post("/api/openml/search")
def openml_search(req: SearchRequest) -> dict[str, Any]:
    try:
        return {"datasets": openml_service.search_datasets(req.query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/openml/download")
def openml_download(req: DownloadRequest) -> dict[str, Any]:
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    csv_path = openml_service.download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(status_code=404, detail="Could not download dataset from OpenML.")
    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")
    return {"dataset_id": dataset_id, "csv_file": os.path.basename(csv_path), "schema": schema}


# ── Data.gov.ph ───────────────────────────────────────────────────────────────

@app.post("/api/datagov_ph/search")
def datagov_ph_search(req: SearchRequest) -> dict[str, Any]:
    try:
        return {"datasets": datagov_ph_service.search_datasets(req.query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/datagov_ph/download")
def datagov_ph_download(req: DownloadRequest) -> dict[str, Any]:
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    csv_path = datagov_ph_service.download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(status_code=404, detail="Could not download dataset from Data.gov.ph.")
    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")
    return {"dataset_id": dataset_id, "csv_file": os.path.basename(csv_path), "schema": schema}


# ── PSA ───────────────────────────────────────────────────────────────────────

@app.post("/api/psa/search")
def psa_search(req: SearchRequest) -> dict[str, Any]:
    try:
        return {"datasets": psa_service.search_datasets(req.query)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/psa/download")
def psa_download(req: DownloadRequest) -> dict[str, Any]:
    dataset_id = str(uuid.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    csv_path = psa_service.download_dataset(req.dataset_ref, dest)
    if not csv_path:
        raise HTTPException(status_code=404, detail="Could not download dataset from PSA.")
    try:
        schema = analyze_dataset(csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema analysis failed: {e}")
    return {"dataset_id": dataset_id, "csv_file": os.path.basename(csv_path), "schema": schema}


# ── Kaggle generate ───────────────────────────────────────────────────────────

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


class SmartSearchRequest(BaseModel):
    prompt: str


class ExtraFieldDef(BaseModel):
    name:        str
    field_type:  str
    description: str              = ""
    constraints: FieldConstraints = FieldConstraints()


class HybridGenerateRequest(BaseModel):
    dataset_id:   str
    changes:      list[FieldChange]
    row_count:    int
    extra_fields: list[ExtraFieldDef] = []


_TEMPLATE_ROWS = 200


@app.post("/api/generate-from-schema")
def generate_from_schema(req: SchemaGenerateRequest):
    """
    Generate a 200-row faker template from a schema definition.
    Returns the dataset_id plus a JSON preview so the frontend can show it
    before the user decides how many rows to expand to via CTGAN.
    """
    import pandas as pd
    import uuid as uuid_module

    df = pd.DataFrame({
        f.name: gen_col(f.field_type, _TEMPLATE_ROWS, f.constraints, f.name, f.description)
        for f in req.fields
    })
    dataset_id = str(uuid_module.uuid4())
    dest = os.path.join(DATASETS_DIR, dataset_id)
    os.makedirs(dest, exist_ok=True)
    template_path = os.path.join(dest, "template.csv")
    df.to_csv(template_path, index=False)
    preview_df = df.head(20)
    preview_rows = preview_df.where(preview_df.notna(), None).to_dict(orient="records")
    return {
        "dataset_id":    dataset_id,
        "template_rows": _TEMPLATE_ROWS,
        "columns":       df.columns.tolist(),
        "preview":       preview_rows,
    }

    # ── The code below is unreachable — refactored into smart_gen_data.py ──
    import numpy as np  # noqa
    import random       # noqa
    import string       # noqa
    from datetime import datetime, timedelta  # noqa

    FIRST = [
        # Filipino male
        "Jose","Juan","Miguel","Carlo","Antonio","Ricardo","Eduardo","Fernando","Ramon","Roberto",
        "Noel","Christian","Ryan","Kenneth","Angelo","Jerome","Jason","Brian","Kevin","Ronald",
        "Emmanuel","Alex","Ivan","Dennis","Arnold","Gilbert","Bernard","Virgilio","Andres","Rodrigo",
        "Mark","John","Patrick","James","Daniel","Michael","David","Joseph","Robert","Christopher",
        # Filipino female
        "Maria","Ana","Rosa","Carmen","Elena","Linda","Grace","Marisol","Luz","Cristina",
        "Fatima","Lourdes","Teresa","Corazon","Dolores","Jessica","Karen","Michelle","Patricia","Sandra",
        "Angelica","Kristine","Jenny","Stephanie","Nicole","Maricel","Rowena","Jennylyn","Precious","Lovely",
        # International
        "Alice","Bob","Diana","Eve","Frank","Henry","Iris","Leo","Nathan","Oliver",
        "Priya","Quinn","Rachel","Samuel","Tina","Emma","Liam","Sophia","Noah","Ava",
        "William","Isabella","James","Mia","Benjamin","Charlotte","Lucas","Amelia","Mason","Harper",
    ]
    LAST = [
        # Filipino
        "Santos","Reyes","Cruz","Bautista","Ocampo","Garcia","Mendoza","Torres","Tan","Flores",
        "Gonzales","Lopez","Ramos","Villanueva","Castro","Morales","Aquino","De Leon","Dela Cruz","Fernandez",
        "Salvador","Bernardo","Pascual","Tolentino","Santiago","Francisco","Aguilar","Navarro","Castillo","Guevara",
        "Rivera","Macaraeg","Soriano","Espiritu","Macapagal","Sison","Lacson","Dizon","Manalo","Pangilinan",
        "Corpuz","Enriquez","Mercado","Buenaventura","Constantino","Delos Santos","Estrada","Ilagan","Jimenez","Lim",
        # International
        "Smith","Johnson","Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Taylor",
        "Anderson","Martinez","Lee","Thompson","White","Harris","Clark","Lewis","Walker","Hall",
        "Young","Allen","King","Wright","Scott","Green","Baker","Adams","Nelson","Carter",
    ]
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
        # People & identity
        "nationality":["American","Filipino","Canadian","German","Japanese","Australian","Brazilian","Indian","French","British","Mexican","Korean","Italian","Spanish","Dutch","Singaporean","Thai","Indonesian","Vietnamese","Chinese"],
        "citizenship":["American","Filipino","Canadian","German","Japanese","Australian","Brazilian","Indian","French","British","Mexican","Korean","Italian","Spanish","Dutch","Singaporean","Thai","Indonesian"],
        "ethnicity":  ["Asian","White","Hispanic","Black","Mixed","Pacific Islander","Middle Eastern","Native American","South Asian","Southeast Asian"],
        "blood":      ["A+","A-","B+","B-","AB+","AB-","O+","O-"],  # matches blood_type, blood_group
        # Organizations & work
        "company":    ["Google","Apple","Microsoft","Amazon","Meta","Netflix","Tesla","Samsung","IBM","Intel","Oracle","Adobe","Salesforce","Shopify","Uber","Airbnb","Spotify","Grab","Lazada","SM Group","Ayala Corporation","BDO Unibank","PLDT","Meralco","Jollibee","Globe Telecom","Ayala Land","BPI","Metrobank"],
        "organization":["United Nations","World Health Organization","Red Cross","UNICEF","Amnesty International","Greenpeace","World Bank","IMF","ASEAN","APEC","NATO","WHO","UNESCO","UNDP","ILO"],
        "employer":   ["Google","Apple","Microsoft","Amazon","Meta","Netflix","Tesla","Samsung","IBM","Intel","Oracle","Adobe","Salesforce","Shopify","Uber","Jollibee","Globe","PLDT","SM Group","Ayala"],
        "brand":      ["Nike","Adidas","Apple","Samsung","Toyota","Honda","Sony","LG","Uniqlo","H&M","Zara","Louis Vuitton","Gucci","Prada","Chanel","Rolex","Nestlé","Coca-Cola","Pepsi","McDonald's"],
        "job_title":  ["Software Engineer","Product Manager","Data Analyst","UX Designer","Marketing Manager","HR Specialist","Financial Analyst","Operations Manager","Sales Representative","IT Specialist","Customer Service Representative","Business Analyst","Project Manager","QA Engineer","DevOps Engineer","Full Stack Developer","Data Scientist","Content Writer","Graphic Designer","Accountant"],
        "position":   ["Software Engineer","Product Manager","Data Analyst","UX Designer","Marketing Manager","HR Specialist","Financial Analyst","Operations Manager","Sales Representative","IT Specialist","Business Analyst","Project Manager","Team Lead","Senior Associate","Director","VP","Associate","Intern","Senior Engineer","Lead Developer"],
        "designation":["Software Engineer","Product Manager","Data Analyst","Marketing Manager","HR Specialist","Operations Manager","Sales Representative","IT Specialist","Business Analyst","Project Manager","Team Lead","Director","VP","Associate","Senior Engineer","Intern","Consultant","Specialist","Coordinator","Supervisor"],
        # Education
        "university": ["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","Far Eastern University","Polytechnic University of the Philippines","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University","Cambridge University","UC Berkeley","Yale University"],
        "college":    ["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","Far Eastern University","Polytechnic University of the Philippines","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University"],
        "school":     ["UP High School","Ateneo de Manila","La Salle Greenhills","Xavier School","Assumption College","Miriam College","San Beda","Adamson University","Mapua University","National University","Harvard University","Oxford University","MIT"],
        "institution":["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University","Cambridge University"],
        "course":     ["Computer Science","Business Administration","Nursing","Information Technology","Electronics Engineering","Civil Engineering","Accountancy","Psychology","Architecture","Medicine","Law","Tourism","Communication","Marketing","Finance","Education","Biology","Chemistry","Physics","Mathematics"],
        "subject":    ["Mathematics","English","Science","History","Geography","Physics","Chemistry","Biology","Computer Science","Physical Education","Art","Music","Social Studies","Philosophy","Economics","Literature","Filipino","Statistics","Trigonometry","Calculus"],
        "major":      ["Computer Science","Business Administration","Nursing","Information Technology","Engineering","Education","Accountancy","Psychology","Architecture","Liberal Arts","Fine Arts","Mathematics","Biology","Chemistry","Physics","Communication","Marketing","Finance","Law","Medicine"],
        "degree":     ["High School","Bachelor's","Master's","PhD","Associate","Vocational","Doctor of Medicine","Juris Doctor","MBA","MSc","MA"],
        "year_level": ["1st Year","2nd Year","3rd Year","4th Year","5th Year","Graduate"],
        # Products & commerce
        "product_name":["Laptop Pro X","Wireless Earbuds","Smart Watch Series 5","4K Monitor","Mechanical Keyboard","Gaming Mouse","USB-C Hub","Portable Charger","Bluetooth Speaker","Webcam HD","Office Chair","Standing Desk","Notebook Set","Pen Drive 128GB","External SSD","Smart TV 55\"","Air Purifier","Coffee Maker","Electric Fan","Rice Cooker"],
        "item":       ["Laptop","Smartphone","Tablet","Monitor","Keyboard","Mouse","Headphones","Charger","Speaker","Webcam","Chair","Desk","Notebook","USB Drive","Hard Drive","TV","Printer","Scanner","Router","Switch"],
        "service":    ["Cloud Hosting","Technical Support","Consulting","Training","Maintenance","Installation","Delivery","Subscription","Premium Access","API Access","Data Storage","Email Service","VPN Service","Security Audit","Software License"],
        "payment_method":["Credit Card","Debit Card","PayPal","GCash","Maya","Bank Transfer","Cash","Cryptocurrency","Check","Installment"],
        "payment":    ["Credit Card","Debit Card","PayPal","GCash","Maya","Bank Transfer","Cash","Cryptocurrency","Check","Installment"],
        "shipping":   ["Standard","Express","Overnight","Same-Day","Free Shipping","Economy","Priority","Tracked","Untracked","International"],
        # Health & medical
        "ward":       ["ICU","Emergency","Pediatrics","Cardiology","Oncology","Neurology","Orthopedics","Maternity","Geriatrics","Psychiatry","General"],
        "hospital":   ["Philippine General Hospital","St. Luke's Medical Center","Makati Medical Center","The Medical City","Asian Hospital","National Kidney Institute","Cardinal Santos Medical Center","Ospital ng Maynila","University of Santo Tomas Hospital","St. Elizabeth Hospital"],
        "specialist": ["Cardiologist","Neurologist","Oncologist","Pediatrician","Orthopedic Surgeon","Dermatologist","Psychiatrist","Radiologist","Endocrinologist","Gastroenterologist","General Practitioner","Ophthalmologist","ENT Specialist","Pulmonologist","Rheumatologist"],
        "symptom":    ["Fever","Cough","Headache","Fatigue","Shortness of breath","Nausea","Chest pain","Dizziness","Back pain","Joint pain","Sore throat","Rash","Vomiting","Diarrhea","Loss of appetite"],
        # Philippine-specific geography
        "barangay":   ["Barangay 1","Barangay 2","Barangay 3","Barangay 4","Barangay 5","Barangay 6","Barangay 7","Barangay 8","Barangay 9","Barangay 10","Barangay 11","Barangay 12","Barangay 13","Barangay 14","Barangay 15","Barangay 16","Barangay 17","Barretto","East Bajac-Bajac","West Bajac-Bajac","East Tapinac","West Tapinac","Gordon Heights","Kalaklan","Mabayuan","New Cabalan","Old Cabalan","Pag-asa","Sta. Rita"],
        "brgy":       ["Barangay 1","Barangay 2","Barangay 3","Barangay 4","Barangay 5","Barangay 6","Barangay 7","Barangay 8","Barangay 9","Barangay 10","Barangay 11","Barangay 12","Barangay 13","Barangay 14","Barangay 15","Barangay 16","Barangay 17","Barretto","East Bajac-Bajac","West Bajac-Bajac","East Tapinac","West Tapinac","Gordon Heights","Kalaklan","Mabayuan","New Cabalan","Old Cabalan","Pag-asa","Sta. Rita"],
        "municipality":["Olongapo","Subic","San Antonio","San Narciso","Castillejos","San Felipe","Santa Cruz","Palauig","Candelaria","Masinloc","Iba","San Marcelino","Cabangan","San Antonio","Botolan"],
        "district":   ["District 1","District 2","District 3","District 4","District 5","Northern District","Southern District","Eastern District","Western District","Central District"],
        # Philippine regions and provinces (proper names)
        "ph_region":  ["NCR","Region I","Region II","Region III","Region IV-A","Region IV-B","Region V","Region VI","Region VII","Region VIII","Region IX","Region X","Region XI","Region XII","CARAGA","CAR","BARMM"],
        "ph_province":["Metro Manila","Cebu","Davao del Sur","Laguna","Batangas","Pampanga","Bulacan","Cavite","Rizal","Pangasinan","Zambales","Nueva Ecija","Iloilo","Negros Occidental","Leyte","Quezon","Camarines Sur","Albay","Isabela","Cagayan"],
        # Time and scheduling
        "day_of_week":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
        "weekday":    ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
        "month_name": ["January","February","March","April","May","June","July","August","September","October","November","December"],
        "quarter":    ["Q1","Q2","Q3","Q4","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
        "shift":      ["Morning Shift","Afternoon Shift","Night Shift","Graveyard Shift","Day Shift"],
        "time_slot":  ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM"],
        "schedule":   ["Daily","Weekly","Bi-weekly","Monthly","Quarterly","Annually","On-demand","Flexible","Fixed"],
        "frequency":  ["Daily","Weekly","Bi-weekly","Monthly","Quarterly","Annually","One-time","Recurring"],
        "semester":   ["1st Semester","2nd Semester","Summer Term"],
        "school_year":["2020-2021","2021-2022","2022-2023","2023-2024","2024-2025","2025-2026"],
        "term":       ["1st Semester","2nd Semester","Summer Term","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
        # Personal / demographic
        "civil_status":["Single","Married","Widowed","Separated","Annulled","Live-in"],
        "relationship":["Single","Married","Widowed","Separated","Annulled","Divorced","In a Relationship"],
        "religion":   ["Roman Catholic","Islam","Iglesia ni Cristo","Protestant","Seventh-day Adventist","Buddhism","Jehovah's Witness","Evangelical","Pentecostal","Atheist / Agnostic","Other"],
        "suffix":     ["Jr.","Sr.","II","III","IV","N/A"],
        "honorific":  ["Mr.","Ms.","Mrs.","Dr.","Engr.","Atty.","Prof.","Rev."],
        "salutation": ["Mr.","Ms.","Mrs.","Dr.","Engr.","Atty.","Prof."],
        # Philippine K-12 and education
        "strand":     ["STEM","ABM","HUMSS","GAS","TVL – Industrial Arts","TVL – Home Economics","TVL – ICT","TVL – Agriculture","Sports Track","Arts and Design Track"],
        "track":      ["Academic Track","Technical-Vocational-Livelihood Track","Sports Track","Arts and Design Track"],
        "section":    ["Section A","Section B","Section C","Section D","Section E","Section F","Section G","Section H"],
        "year_level": ["Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","1st Year","2nd Year","3rd Year","4th Year","5th Year","Graduate"],
        "grading_period":["1st Grading","2nd Grading","3rd Grading","4th Grading","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
        "learning_mode":["Face-to-Face","Online","Modular","Blended","Homeschool"],
        # Result / outcome / decision
        "result":     ["Passed","Failed","Incomplete","Pending","Under Review","Conditionally Passed"],
        "outcome":    ["Successful","Failed","Pending","Completed","Cancelled","In Progress","On Hold"],
        "verdict":    ["Approved","Rejected","Pending","Under Review","Conditionally Approved","Deferred"],
        "decision":   ["Approved","Rejected","Pending","Under Review","Escalated","Deferred"],
        "pass_fail":  ["Pass","Fail"],
        "approval":   ["Approved","Rejected","Pending","Under Review","Conditionally Approved"],
        # Purpose / reason / mode
        "purpose":    ["Personal","Business","Education","Research","Recreation","Emergency","Medical","Travel","Shopping","Government"],
        "reason":     ["Personal","Business","Academic","Medical","Travel","Shopping","Recreation","Emergency","Voluntary","Involuntary"],
        "cause":      ["Natural Causes","Accident","Illness","Unknown","Under Investigation","Negligence"],
        "mode":       ["Online","Walk-in","Phone","Email","In-person","Remote","Hybrid"],
        "method":     ["Online","Cash","Bank Transfer","Credit Card","Debit Card","GCash","Maya","Check","Installment","COD"],
        "channel":    ["Website","Mobile App","Social Media","Email","SMS","Phone Call","In-Store","Partner","Referral"],
        "source":     ["Website","Social Media","Referral","Email","Walk-in","Advertisement","Search Engine","Word of Mouth","Partner","Agent"],
        "transport":  ["Car","Bus","Jeepney","Tricycle","Motorcycle","Train (MRT/LRT)","Plane","Ship","Bicycle","UV Express","P2P Bus"],
        "vehicle":    ["Sedan","SUV","Truck","Van","Motorcycle","Bus","Jeepney","Tricycle","Bicycle","Electric Vehicle"],
        # Access / account / membership
        "access_level":["Full Access","Read Only","Write Only","Admin","Restricted","Guest","Public","Private"],
        "account_type":["Admin","Regular User","Premium","Guest","Staff","Moderator","Subscriber","Visitor"],
        "membership": ["Free","Basic","Standard","Premium","VIP","Gold","Silver","Platinum","Trial"],
        "subscription":["Free","Monthly","Quarterly","Annual","Lifetime","Trial","Enterprise"],
        "tier":       ["Bronze","Silver","Gold","Platinum","Diamond","Free","Basic","Pro"],
        # Logistics and orders
        "order_status":["Pending","Confirmed","Processing","Shipped","Out for Delivery","Delivered","Cancelled","Returned","Refunded"],
        "delivery_status":["Pending","Dispatched","In Transit","Out for Delivery","Delivered","Failed","Returned"],
        "tracking":   ["Pending","In Transit","Out for Delivery","Delivered","Exception","Returned to Sender"],
        "return_reason":["Defective","Wrong Item","Changed Mind","Not as Described","Duplicate Order","Other"],
        # File / format / technical
        "format":     ["PDF","Excel (.xlsx)","CSV","Word (.docx)","JSON","XML","PNG","JPEG","MP4","ZIP","TXT","PowerPoint (.pptx)"],
        "file_type":  ["Document","Spreadsheet","Image","Video","Audio","Archive","Database","Executable","Text","Presentation"],
        "extension":  [".pdf",".xlsx",".csv",".docx",".json",".xml",".png",".jpg",".mp4",".zip",".txt",".pptx"],
        "resolution": ["1080p","720p","4K","480p","1440p","360p","2160p"],
        # Business / operations
        "transaction_type":["Credit","Debit","Transfer","Withdrawal","Deposit","Payment","Refund","Adjustment"],
        "transaction":["Credit","Debit","Transfer","Withdrawal","Deposit","Payment","Refund","Adjustment"],
        "invoice_status":["Paid","Unpaid","Overdue","Partially Paid","Cancelled","Draft","Sent"],
        "contract_type":["Full-time","Part-time","Contractual","Project-based","Probationary","Consultancy","Internship"],
        "employment": ["Full-time","Part-time","Contractual","Project-based","Probationary","Consultancy","Internship","Casual"],
        "position_level":["Entry Level","Junior","Mid-level","Senior","Lead","Manager","Director","VP","C-Level","Intern"],
        # Events and occasions
        "occasion":   ["Birthday","Wedding","Anniversary","Christmas","New Year","Valentine's Day","Graduation","Baptism","Reunion","Fiesta","Halloween","Thanksgiving","Easter","Mother's Day","Father's Day"],
        "event_type": ["Conference","Seminar","Workshop","Webinar","Training","Meeting","Party","Wedding","Birthday","Graduation","Exhibition","Festival"],
        "holiday":    ["New Year's Day","Valentine's Day","Holy Week","Labor Day","Independence Day","Bonifacio Day","Christmas Day","Rizal Day","All Saints' Day","Eid al-Fitr","Eid al-Adha"],
        # Feedback / satisfaction
        "satisfaction":["Very Satisfied","Satisfied","Neutral","Dissatisfied","Very Dissatisfied"],
        "rating_label":["Poor","Fair","Good","Very Good","Excellent"],
        "recommendation":["Highly Recommended","Recommended","Neutral","Not Recommended","Would Not Recommend"],
        # IT / network / system
        "log_level":  ["INFO","DEBUG","WARNING","ERROR","CRITICAL","FATAL","TRACE"],
        "environment":["Development","Staging","Production","Testing","QA","Pre-production","Sandbox"],
        "http_method":["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"],
        "error_code": ["200","201","400","401","403","404","422","500","502","503"],
    }

    # Smart numeric ranges keyed by substring of field name (applied when no user constraints are given)
    _NUMERIC_SMART: dict[str, tuple[float, float, str]] = {
        "age":          (18,    80,       "normal"),
        "salary":       (25000, 150000,   "skewed"),
        "income":       (25000, 150000,   "skewed"),
        "wage":         (15,    100,      "skewed"),
        "price":        (1.0,   999.99,   "skewed"),
        "cost":         (1.0,   5000.0,   "skewed"),
        "amount":       (10.0,  10000.0,  "skewed"),
        "fee":          (1.0,   500.0,    "uniform"),
        "revenue":      (1000,  1000000,  "skewed"),
        "budget":       (500,   500000,   "skewed"),
        "balance":      (0,     100000,   "skewed"),
        "credit_score": (300,   850,      "normal"),
        "score":        (0,     100,      "normal"),
        "rating":       (1,     5,        "normal"),
        "gpa":          (1.5,   4.0,      "normal"),
        "grade":        (60,    100,      "normal"),
        "year":         (2015,  2025,     "uniform"),
        "quantity":     (1,     500,      "skewed"),
        "qty":          (1,     500,      "skewed"),
        "stock":        (0,     1000,     "uniform"),
        "weight":       (40,    150,      "normal"),
        "height":       (150,   200,      "normal"),
        "bmi":          (17.5,  35.0,     "normal"),
        "temperature":  (36.0,  39.5,     "normal"),
        "percent":      (0,     100,      "normal"),
        "percentage":   (0,     100,      "normal"),
        "pct":          (0,     100,      "normal"),
        "ratio":        (0.0,   1.0,      "uniform"),
        "discount":     (0,     70,       "skewed"),
        "tax":          (0,     30,       "normal"),
        "interest":     (0.1,   25.0,     "normal"),
        "distance":     (1,     10000,    "skewed"),
        "speed":        (0,     200,      "normal"),
        "latitude":     (-90,   90,       "uniform"),
        "longitude":    (-180,  180,      "uniform"),
        "lat":          (-90,   90,       "uniform"),
        "lon":          (-180,  180,      "uniform"),
        "lng":          (-180,  180,      "uniform"),
        "port":         (1024,  65535,    "uniform"),
        "duration":     (1,     3600,     "skewed"),
        "rank":         (1,     1000,     "uniform"),
        "capacity":     (1,     10000,    "skewed"),
        "population":   (1000,  10000000, "skewed"),
        # Time components
        "hours":        (0,     23,       "uniform"),
        "hour":         (0,     23,       "uniform"),
        "minutes":      (0,     59,       "uniform"),
        "seconds":      (0,     59,       "uniform"),
        "day_num":      (1,     31,       "uniform"),
        "month_num":    (1,     12,       "uniform"),
        # Academic
        "units":        (3,     24,       "uniform"),
        "marks":        (0,     100,      "normal"),
        "gwa":          (1.0,   4.0,      "normal"),
        # Physical measurements
        "bmi":          (17.5,  35.0,     "normal"),
        "pulse":        (60,    100,      "normal"),
        "heart_rate":   (60,    100,      "normal"),
        "blood_pressure_systolic":  (90,  140, "normal"),
        "blood_pressure_diastolic": (60,  90,  "normal"),
        # Business / financial
        "order_total":  (100,   50000,    "skewed"),
        "invoice":      (500,   500000,   "skewed"),
        "tip":          (0,     500,      "skewed"),
        "profit":       (0,     100000,   "skewed"),
        "loss":         (0,     50000,    "skewed"),
        "expense":      (100,   50000,    "skewed"),
        "payment_amount":(100,  100000,   "skewed"),
        "transaction_amount":(100, 500000,"skewed"),
        # Engagement / analytics
        "views":        (0,     100000,   "skewed"),
        "clicks":       (0,     10000,    "skewed"),
        "likes":        (0,     50000,    "skewed"),
        "shares":       (0,     5000,     "skewed"),
        "downloads":    (0,     10000,    "skewed"),
        "impressions":  (0,     500000,   "skewed"),
        # Location
        "floor":        (1,     50,       "uniform"),
        "room":         (100,   999,      "uniform"),
        "unit":         (1,     200,      "uniform"),
        "zip":          (1000,  9999,     "uniform"),
        # Logistics
        "passengers":   (1,     500,      "skewed"),
        "seats":        (1,     100,      "uniform"),
        "items":        (1,     100,      "skewed"),
        "pages":        (1,     500,      "skewed"),
        "chapters":     (1,     50,       "uniform"),
        "episodes":     (1,     100,      "uniform"),
        "seasons":      (1,     20,       "uniform"),
        "attempts":     (1,     10,       "skewed"),
        "errors":       (0,     50,       "skewed"),
        "retries":      (0,     5,        "skewed"),
        "response_time":(10,    5000,     "skewed"),
        "uptime":       (90.0,  100.0,    "normal"),
    }

    def _keyword_pool(field_name: str, description: str) -> list[str] | None:
        hint = (field_name + " " + description).lower().replace("_", " ")
        for key, pool in _POOLS.items():
            if key in hint:
                return pool
        return None

    def gen_col(ftype: str, n: int, c: FieldConstraints, field_name: str = "", description: str = ""):
        null_mask = np.random.random(n) < (min(c.null_rate, 50.0) / 100.0)

        # Normalised field name used for all pattern checks below
        fname = field_name.lower().replace(" ", "_").replace("-", "_")

        # Apply smart numeric ranges when the user left min/max blank
        if ftype in ("integer", "float") and c.min_val is None and c.max_val is None:
            for kw, (s_lo, s_hi, s_dist) in _NUMERIC_SMART.items():
                if kw in fname:
                    c = FieldConstraints(min_val=s_lo, max_val=s_hi,
                                         distribution=s_dist, null_rate=c.null_rate)
                    break

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

            # ── Name-component patterns need FIRST/LAST combined specially ──
            elif any(p in fname for p in ("full_name", "fullname", "full name", "complete_name")):
                data = np.array([f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)], dtype=object)
            elif any(p in fname for p in ("first_name", "firstname", "fname", "given_name", "forename")):
                data = np.array([random.choice(FIRST) for _ in range(n)], dtype=object)
            elif any(p in fname for p in ("last_name", "lastname", "lname", "surname", "family_name", "middle_name", "middlename")):
                data = np.array([random.choice(LAST) for _ in range(n)], dtype=object)

            # ── Username: realistic handles like alice.smith42 ──
            elif any(p in fname for p in ("username", "user_name", "login", "handle", "screen_name", "account_name")):
                seps = [".", "_", ""]
                data = np.array([
                    f"{random.choice(FIRST).lower()}{random.choice(seps)}{random.choice(LAST).lower()}"
                    f"{random.randint(1,99) if random.random()<0.4 else ''}"
                    for _ in range(n)
                ], dtype=object)

            # ── Website / URL ──
            elif any(p in fname for p in ("website", "url", "web_url", "link", "homepage", "site_url", "webpage")):
                prefixes = ["www.",""]
                tlds = [".com",".org",".net",".io",".co",".ph"]
                stems = ["tech","solutions","global","smart","digital","next","alpha","nova","prime","core","hub","lab","works","group","media"]
                data = np.array([
                    f"https://{random.choice(prefixes)}{random.choice(LAST).lower()}{random.choice(stems)}{random.choice(tlds)}"
                    for _ in range(n)
                ], dtype=object)

            # ── Zip / postal code ──
            elif any(p in fname for p in ("zip_code", "zipcode", "zip", "postal_code", "postcode", "postal")):
                data = np.array([f"{random.randint(1000, 9999)}" for _ in range(n)], dtype=object)

            # ── General person-name catch: "name" alone, or *_name fields that are
            #    clearly about a person (patient_name, customer_name, employee_name, etc.)
            #    Excludes technical names: file_name, table_name, product_name, etc. ──
            elif fname == "name" or (
                "_name" in fname and not any(ex in fname for ex in (
                    "file","column","table","database","domain","host","service","app",
                    "system","page","class","function","variable","method","object",
                    "bucket","key","field","attr","property","product","brand","item",
                    "drug","street","city","country","region","company","org","team",
                    "store","shop","game","song","book","movie","course","subject",
                ))
            ):
                data = np.array([f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)], dtype=object)

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
            def _make_email(_):
                first  = random.choice(FIRST).lower()
                last   = random.choice(LAST).lower()
                sep    = random.choice([".", "_", ""])
                suffix = str(random.randint(1, 99)) if random.random() < 0.3 else ""
                return f"{first}{sep}{last}{suffix}@{random.choice(DOMAINS)}"
            data = np.array([_make_email(i) for i in range(n)], dtype=object)
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


# ── Smart multi-source search ─────────────────────────────────────────────────

@app.post("/api/smart-search")
def smart_search(req: SmartSearchRequest) -> dict[str, Any]:
    """
    Search all dataset sources concurrently and return top results labelled
    by source. Used by the hybrid LLM+real-data schema generation flow.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    sources = {
        "kaggle":      ("Kaggle",       "🏆", search_datasets),
        "huggingface": ("Hugging Face", "🤗", huggingface_service.search_datasets),
        "uci":         ("UCI ML Repo",  "🎓", uci_service.search_datasets),
        "openml":      ("OpenML",       "📊", openml_service.search_datasets),
        "datagov_ph":  ("Data.gov.ph",  "🇵🇭", datagov_ph_service.search_datasets),
        "psa":         ("PSA",          "📋", psa_service.search_datasets),
    }

    results: list[dict] = []

    def _search(source_id: str, source_label: str, source_icon: str, search_fn):
        try:
            datasets = search_fn(req.prompt)
            for ds in datasets[:3]:
                ds["source"]      = source_id
                ds["sourceLabel"] = source_label
                ds["sourceIcon"]  = source_icon
            return datasets[:3]
        except Exception as e:
            print(f"[smart_search] {source_id} error: {e}")
            return []

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(_search, sid, lbl, ico, fn): sid
            for sid, (lbl, ico, fn) in sources.items()
        }
        for future in as_completed(futures):
            try:
                results.extend(future.result())
            except Exception:
                pass

    results.sort(key=lambda x: x.get("downloadCount", 0), reverse=True)
    return {"datasets": results[:10]}


# ── Hybrid generate (CTGAN real fields + schema-based LLM fields) ─────────────

@app.post("/api/generate-hybrid")
def generate_hybrid(req: HybridGenerateRequest):
    """
    Run CTGAN on a real downloaded dataset, then append any LLM-specified
    extra columns using smart schema-based generation.
    """
    import pandas as pd

    dataset_path = os.path.join(DATASETS_DIR, req.dataset_id)
    if not os.path.isdir(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if not (1_000 <= req.row_count <= 100_000):
        raise HTTPException(status_code=400, detail="row_count must be between 1,000 and 100,000.")

    changes = [c.model_dump() for c in req.changes]

    try:
        output_path = generate_synthetic_data(
            dataset_path=dataset_path,
            changes=changes,
            row_count=req.row_count,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CTGAN generation failed: {e}")

    if req.extra_fields:
        df = pd.read_csv(output_path)
        n  = len(df)
        for extra in req.extra_fields:
            df[extra.name] = gen_col(
                extra.field_type, n, extra.constraints,
                extra.name, extra.description,
            )
        df.to_csv(output_path, index=False)

    return FileResponse(
        path=output_path,
        media_type="text/csv",
        filename=f"synthetic_{req.dataset_id[:8]}.csv",
    )


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
