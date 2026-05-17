# SynthCS — Synthetic Dataset Generator

A full-stack web application that generates realistic synthetic tabular datasets using **CTGAN** (Conditional Tabular GAN) and **LLM augmentation**. Users can search real open-source datasets (Kaggle, HuggingFace, UCI ML Repository, OpenML, Data.gov.ph, PSA), customize the schema, and generate statistically faithful synthetic data for AI training, software testing, security research, and stress testing.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────────┐
│   Frontend (React)  │────▶│  Node.js API (Express)   │     │  Python API (FastAPI)        │
│   Deployed: Vercel  │     │  Deployed: Railway       │     │  Deployed: HuggingFace Spaces│
│                     │     │  - Auth (JWT + OAuth)    │     │  - CTGAN training            │
│  React + Vite +     │◀────│  - LLM schema generation │     │  - Gaussian Copula fallback  │
│  Tailwind CSS       │     │  - PostgreSQL (users,    │     │  - Dataset download/search   │
│  PWA-enabled        │────────────────────────────────▶│  - Real CSV synthesis        │
└─────────────────────┘     │    schemas, downloads)   │     └──────────────────────────────┘
                            └──────────────────────────┘
```

---

## Prerequisites

- **Node.js** v18 or higher
- **Python** 3.11
- **PostgreSQL** database (local or hosted, e.g. Railway, Supabase, Neon)
- Kaggle account (for Kaggle dataset downloads)
- Anthropic API key (Claude — for LLM schema generation)

---

## Project Structure

```
synthgen-clean/
├── src/                    # React frontend
│   ├── pages/              # SchemaBuilder, Dashboard, Downloads, etc.
│   └── components/         # Layout, GeneratingLoader, OnboardingTour, etc.
├── backend/
│   ├── server.js           # Node.js/Express API
│   ├── db.js               # PostgreSQL connection
│   ├── package.json
│   └── python/             # Python FastAPI service
│       ├── main.py         # FastAPI app + all endpoints
│       ├── generator.py    # CTGAN + Gaussian Copula synthesis
│       ├── kaggle_service.py
│       ├── huggingface_service.py
│       ├── uci_service.py
│       ├── openml_service.py
│       ├── requirements.txt
│       └── Dockerfile
├── docs/                   # Feature documentation and user manual
├── public/                 # Static assets (logo, PWA icons)
├── package.json            # Frontend dependencies
└── vite.config.ts
```

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Lyresh-hub/SynthCS.git
cd SynthCS
```

---

### 2. Frontend

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env`:

```env
VITE_NODE_API=http://localhost:3000
VITE_PYTHON_API=http://localhost:7860
```

Start the dev server:

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

### 3. Node.js Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/synthcs

# Auth
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:5173

# LLM (Anthropic Claude)
ANTHROPIC_API_KEY=sk-ant-...

# LLM fallback (Groq)
GROQ_API_KEY=gsk_...

# OAuth — Google (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# OAuth — GitHub (optional)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Email (Resend)
RESEND_API_KEY=re_...
```

Initialize the database (run the SQL schema manually or via migration):

```bash
psql $DATABASE_URL -f schema.sql
```

Start the server:

```bash
npm run dev      # development (nodemon)
npm start        # production
```

Node API runs at `http://localhost:3000`.

---

### 4. Python Backend

```bash
cd backend/python

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate      # macOS/Linux
venv\Scripts\activate         # Windows

# Install PyTorch CPU-only first (prevents CUDA from being pulled in)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
pip install -r requirements.txt
```

Create `backend/python/.env`:

```env
KAGGLE_USERNAME=your_kaggle_username
KAGGLE_KEY=your_kaggle_api_key
```

Start the FastAPI server:

```bash
uvicorn main:app --host 0.0.0.0 --port 7860 --reload
```

Python API runs at `http://localhost:7860`.  
Interactive API docs: `http://localhost:7860/docs`

---

## Running with Docker (Python backend only)

```bash
cd backend/python
docker build -t synthcs-python .
docker run -p 7860:7860 \
  -e KAGGLE_USERNAME=your_username \
  -e KAGGLE_KEY=your_key \
  synthcs-python
```

---

## Environment Variables Reference

### Frontend (`/.env`)

| Variable | Description |
|---|---|
| `VITE_NODE_API` | URL of the Node.js backend (e.g. `https://your-app.railway.app`) |
| `VITE_PYTHON_API` | URL of the Python backend (e.g. `https://your-space.hf.space`) |

### Node.js Backend (`/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret key for signing JWT tokens |
| `FRONTEND_URL` | ✅ | Frontend origin for CORS (e.g. `https://your-app.vercel.app`) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Claude API key for LLM schema generation |
| `GROQ_API_KEY` | Optional | Groq API key (fallback LLM) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth client secret |
| `RESEND_API_KEY` | Optional | Resend API key for transactional emails |

### Python Backend (`/backend/python/.env`)

| Variable | Required | Description |
|---|---|---|
| `KAGGLE_USERNAME` | Optional | Kaggle account username (enables Kaggle dataset search/download) |
| `KAGGLE_KEY` | Optional | Kaggle API key |

---

## Deployment

### Frontend → Vercel

1. Connect the repository to Vercel.
2. Set **Root Directory** to `/` (project root).
3. Add environment variables: `VITE_NODE_API`, `VITE_PYTHON_API`.
4. Build command: `npm run build` — Output: `dist/`.

### Node.js API → Railway

1. Connect the repository to Railway.
2. Set **Root Directory** to `backend/`.
3. Add all Node.js environment variables in Railway's Variables panel.
4. Railway auto-detects `package.json` and runs `node server.js`.

### Python API → HuggingFace Spaces

1. Create a new Space with **Docker** SDK.
2. Push the contents of `backend/python/` to the Space repository.
3. Add `KAGGLE_USERNAME` and `KAGGLE_KEY` in the Space's **Secrets** panel.
4. The Space builds from `Dockerfile` and exposes port 7860.

> **Note:** HuggingFace free-tier Spaces go to sleep after inactivity. The frontend handles this automatically — it detects wakeup HTML responses and retries the request after 30 seconds (up to 3 attempts).

---

## Usage

### Generating a dataset from a real source

1. Open **Schema Builder** from the sidebar.
2. In the **Search Dataset Sources** panel, type a topic (e.g. "employee salary", "diabetes prediction").
3. Browse results from Kaggle, HuggingFace, UCI, OpenML, Data.gov.ph, and PSA.
4. Click **Use Dataset** on a result — the schema loads automatically.
5. Review and edit field names, types, null rates, and constraints.
6. Set the row count and click **Generate with CTGAN**.
7. Download the result as CSV, JSON, or XLSX.

### Generating a dataset from a prompt (LLM path)

1. Open **Schema Builder**.
2. Type a description in the **LLM Schema Generator** panel (e.g. *"Cybersecurity network traffic dataset with IP addresses, attack types, and threat severity"*).
3. Press **Generate Schema**.
   - If a matching real dataset is found, it is shown for selection. The AI adds any fields your prompt mentioned that are missing from the real data (yellow **AI Added** badges).
   - If no real dataset is found, the AI generates the full schema from your description.
4. Review the schema, set the row count, and click **Generate → Preview**.

### Generation modes

| Mode | Use case |
|---|---|
| **Mock Data** | App development, testing with realistic-looking records |
| **AI Training** | Labeled datasets for ML models (fraud detection, churn prediction) |
| **Cybersecurity** | Network traffic, attack logs, intrusion detection training data |
| **Stress Testing** | Edge cases, extreme values, and anomalies for load testing |

---

## Generation Pipeline

| Data source | Method | Notes |
|---|---|---|
| Real dataset (Kaggle / HuggingFace / UCI / OpenML) | **CTGAN** | Trains on 80% of real data; 20% held out for validation |
| CTGAN failure (memory/row limit) | **Gaussian Copula** | Statistical fallback |
| LLM path — real dataset found | **CTGAN** | Real data downloaded, same pipeline as above |
| LLM path — no real dataset found | **Gaussian Copula** | Scales a 200-row Faker template; CTGAN is not appropriate without real training data |

---

## Key Features

- **Multi-source unified search** — Kaggle, HuggingFace, UCI ML Repository, OpenML, Data.gov.ph, PSA
- **AI Augmented schemas** — LLM detects missing fields from your prompt and adds them to a real dataset's schema
- **Multi-table generation** — Generate related tables with enforced foreign key consistency
- **Behavioral consistency** — HR/payroll fields (salary, role, experience, hire date) are generated with realistic relationships
- **Anomaly injection** — Insert null spikes, outliers, duplicates, or corrupted values at a controlled rate
- **Temporal configuration** — Ordered timestamps, business-hours filtering, date ranges
- **Relationship rules** — IF–THEN constraints across columns (e.g. IF status = "Cancelled" THEN refund > 0)
- **PWA support** — Installable as a desktop/mobile app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Wouter, Lucide React |
| Node API | Express, PostgreSQL (pg), JWT, Passport (Google/GitHub OAuth) |
| LLM | Anthropic Claude (Haiku / Sonnet), Groq |
| Python API | FastAPI, Uvicorn |
| Synthesis | CTGAN, Gaussian Copula, pandas, NumPy, SciPy, scikit-learn |
| Dataset sources | Kaggle API, HuggingFace Hub, ucimlrepo, OpenML, requests |
| Deployment | Vercel (frontend), Railway (Node API), HuggingFace Spaces (Python API) |

---

## License

This project was developed as a thesis submission. All rights reserved.
