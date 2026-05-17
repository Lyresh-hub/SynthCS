# SYNTHCS — Synthetic Dataset Generator
## User Manual · Version 1.0
**Gordon College — College of Computer Studies**  
Olongapo City, Philippines

*Synthetic Data. Real Results.*

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [The Dashboard](#3-the-dashboard)
4. [Generating a Synthetic Dataset](#4-generating-a-synthetic-dataset)
5. [Advanced Generation Options](#5-advanced-generation-options)
6. [Viewing and Exporting Your Dataset](#6-viewing-and-exporting-your-dataset)
7. [Statistical Validation](#7-statistical-validation)
8. [Managing Your Datasets](#8-managing-your-datasets)
9. [Frequently Asked Questions](#9-frequently-asked-questions)
10. [Troubleshooting](#10-troubleshooting)
11. [Glossary](#11-glossary)
12. [Contact and Support](#12-contact-and-support)

---

## 1. Introduction

### 1.1 What is SynthCS?

SynthCS is a web-based synthetic data generator designed for Computer Science students and researchers. It allows you to create realistic tabular datasets without using sensitive or hard-to-find real-world data. Whether you are building a machine learning model, conducting research, or testing an application, SynthCS generates high-quality data tailored to your needs.

SynthCS uses **CTGAN (Conditional Tabular GAN)** — a deep learning model that learns statistical patterns from real data and reproduces them in new, fully synthetic rows.

### 1.2 What Can SynthCS Do?

- Search and import reference datasets directly from **Kaggle, Hugging Face, UCI, OpenML, Data.gov.ph, and PSA** without leaving the app
- Describe your dataset in plain English and let the **AI generate the schema** for you
- Build a custom schema **manually** with full control over every field
- Generate datasets with **1,000 to 100,000 rows**
- Apply advanced rules: **temporal patterns, relational constraints, and anomaly injection**
- Generate **multi-table relational datasets** (e.g., users, orders, products)
- **Validate** the statistical quality of your synthetic data automatically
- **Export** in CSV, JSON, JSONL, SQL, or Excel format

### 1.3 Who Is This Manual For?

This manual is for students and researchers using SynthCS through its web interface. No programming knowledge is required. For technical and system details, refer to the SynthCS Technical Manual.

---

## 2. Getting Started

### 2.1 System Requirements

| | Requirement |
|---|---|
| **Browser** | Google Chrome 110+, Mozilla Firefox 115+, Microsoft Edge 110+ |
| **Internet Connection** | Required |
| **Screen Resolution** | 1280 × 720 or higher recommended |
| **Account** | Free registration required |

### 2.2 Creating an Account

**Step 1.** Open your browser and go to **synthcs.site**

**Step 2.** Click **Sign Up** on the homepage.

**Step 3.** Enter your email address and create a password, then click **Create Account**.

**Step 4.** Check your email inbox for a verification link and click it to activate your account.

> **NOTE:** If you do not see the verification email, check your spam or junk folder. You can also click **Resend Verification** on the login page.

### 2.3 Logging In

**Step 1.** Go to **synthcs.site**

**Step 2.** Enter your registered email and password.

**Step 3.** Click **Log In**.

### 2.4 Resetting a Forgotten Password

**Step 1.** On the login page, click **Forgot Password**.

**Step 2.** Enter your registered email address and click **Send Code**.

**Step 3.** Check your email for a 6-digit verification code.

**Step 4.** Enter the code and your new password, then click **Reset Password**.

---

## 3. The Dashboard

After logging in, you will land on the **Dashboard** — your central hub in SynthCS.

### 3.1 What You Will See

| Section | Description |
|---|---|
| **Stats Bar** | Shows your total generated datasets, saved schemas, and downloads |
| **Quick Generate** | Load a saved schema and generate a new dataset in one click |
| **Recent Datasets** | Your most recently generated datasets with quick access links |
| **Open Schema Builder** | A shortcut button to start a new dataset |

---

## 4. Generating a Synthetic Dataset

SynthCS offers four ways to generate a dataset. Choose the method that best fits your workflow.

---

### Method 1 — Smart Search *(Recommended)*

Search multiple open-source repositories directly from within SynthCS. No manual downloading required.

**Step 1.** Click **Schema Builder** in the left sidebar.

**Step 2.** Type a keyword in the search bar (e.g., *"titanic"*, *"diabetes"*, *"crime"*, *"employee"*).

**Step 3.** Click **Search**. SynthCS will simultaneously search Kaggle, Hugging Face, UCI, OpenML, Data.gov.ph, and PSA.

**Step 4.** Browse the results. You can filter by source and sort by popularity or size.

**Step 5.** Click **Download** on your chosen dataset. SynthCS will import it automatically and detect the schema.

**Step 6.** Review the auto-detected fields and adjust any settings as needed.

**Step 7.** Set the **Number of Rows** (1,000–100,000) and click **Generate**.

> **TIP:** For Philippine-focused research, filter by **Data.gov.ph** or **PSA**. For general ML datasets, try **Kaggle** or **UCI**.

---

### Method 2 — LLM Schema Generator *(AI-Assisted)*

Describe your dataset in plain English and the AI will build the schema automatically.

**Step 1.** In Schema Builder, click **LLM Schema Generator**.

**Step 2.** Type a description of your dataset. Be as specific as possible.

> *Example: "A cybersecurity intrusion detection log with IP addresses, attack types, timestamps, packet counts, and severity levels for a Philippine university network."*

**Step 3.** Click **Generate Schema**. The AI will generate all fields, types, and constraints.

**Step 4.** Review the generated fields. You can add, remove, or edit any field.

**Step 5.** Set the **Number of Rows** and click **Generate with CTGAN**.

> **NOTE:** The LLM first generates a 200-row template, then CTGAN expands it to your target row count. This may take 2–5 minutes.

---

### Method 3 — Manual Schema Builder

Build your schema from scratch with complete control over every field.

**Step 1.** In Schema Builder, click **+ Add Field** to start adding columns.

**Step 2.** For each field, configure the following:

| Setting | Description |
|---|---|
| **Field Name** | The column name in your dataset |
| **Data Type** | Integer, Float, String, Boolean, Date, Email, Phone, Address, Name, UUID |
| **Description** | Optional hint to help the AI generate smarter values |
| **Min / Max** | Value range for numeric fields |
| **Allowed Values** | Restrict a field to a specific list (e.g., "Male, Female") |
| **Nullable** | Whether the field can contain missing values |
| **Null Rate** | Percentage of rows that will have a missing value |
| **Cardinality** | How many distinct values to generate for categorical fields |

**Step 3.** Add all the fields your dataset needs.

**Step 4.** Set the **Number of Rows** and click **Generate**.

---

### Method 4 — Multi-Table Generation

Generate multiple related tables at once with proper foreign key relationships.

**Step 1.** In Schema Builder, click **Multi-Table** mode.

**Step 2.** Choose a preset (e.g., E-Commerce, Healthcare, Banking) or build your own table structure.

**Step 3.** Configure the fields and row counts for each table.

**Step 4.** Click **Generate All Tables**.

SynthCS will generate all tables simultaneously and maintain referential integrity between them.

---

### 4.1 Schema Presets

SynthCS includes built-in schema presets for common use cases so you do not have to build from scratch.

| Category | Example Presets |
|---|---|
| **Mock Data** | Student records, Employee data, Product catalog |
| **AI Training** | Classification data, Regression data, Clustering data |
| **Cybersecurity** | Intrusion detection logs, Network traffic, Vulnerability reports |
| **Stress Testing** | High-volume transaction data, Load testing datasets |

To use a preset: In Schema Builder, click **Load Preset** and select from the list.

---

## 5. Advanced Generation Options

Before clicking Generate, you can apply advanced rules to make your data more realistic.

### 5.1 Temporal Rules

Add realistic time-based patterns to your date and timestamp columns.

**Step 1.** In the generation settings, expand the **Temporal** section.

**Step 2.** Toggle **Enable Temporal Rules** on.

**Step 3.** Select the timestamp column and configure:

- **Date Range** — the start and end dates for your data
- **Trend** — whether values increase, decrease, or stay flat over time
- **Seasonality** — repeat patterns (daily, weekly, monthly)

> *Example use: Simulate sales data that peaks every December.*

### 5.2 Relational Rules

Define dependencies between columns to ensure logical consistency.

**Step 1.** Expand the **Rules** section.

**Step 2.** Click **+ Add Rule**.

**Step 3.** Select the source column, the condition, and the target column.

> *Example: "salary must be greater than 20,000 when position equals Manager"*

### 5.3 Anomaly Injection

Intentionally introduce outliers, noise, or missing values to simulate real-world data quality issues — useful for testing data cleaning pipelines.

**Step 1.** Expand the **Anomalies** section.

**Step 2.** Toggle **Enable Anomaly Injection** on.

**Step 3.** Set the **anomaly rate** (percentage of rows affected) and **anomaly type** (outliers, noise, or missing values).

---

## 6. Viewing and Exporting Your Dataset

### 6.1 The Data Preview Screen

After generation, SynthCS automatically takes you to the **Data Preview** screen where you can:

- Browse your generated data in a paginated table
- See the total number of rows and columns
- View validation scores at a glance
- Export the dataset in your preferred format

### 6.2 Exporting Your Dataset

**Step 1.** On the Data Preview screen, click the **Export** dropdown.

**Step 2.** Select your preferred format.

**Step 3.** Click **Export**. Your browser will download the file automatically.

| Format | Best For |
|---|---|
| **CSV** | Excel, Google Sheets, Python (pandas), R, SPSS |
| **JSON** | Web applications and REST APIs |
| **JSONL** | Machine learning pipelines (one record per line) |
| **SQL** | Importing directly into a database |
| **Excel (.xlsx)** | Microsoft Excel with formatted sheets |

---

## 7. Statistical Validation

SynthCS automatically evaluates the quality of your synthetic data using four statistical metrics.

### 7.1 Validation Metrics

| Metric | What It Measures |
|---|---|
| **Distribution Similarity** | How closely each column's value distribution matches the original data (Wasserstein distance) |
| **Correlation Preservation** | Whether relationships between columns are maintained in the synthetic data (Pearson correlation) |
| **ML Utility (TSTR)** | Whether a machine learning model trained on synthetic data performs well when tested on real data |
| **Privacy Risk** | Whether any synthetic row is an exact duplicate of a real row from the reference dataset |

### 7.2 Score Interpretation

| Overall Score | Rating | Recommendation |
|---|---|---|
| 80%–100% | **Good** | Your dataset is ready to use |
| 60%–79% | **Acceptable** | Suitable for most research purposes |
| Below 60% | **Low** | Consider using a larger or cleaner reference dataset |

### 7.3 Viewing the Full Report

**Step 1.** On the Data Preview screen, click **View Full Report**.

**Step 2.** The full validation report shows individual scores for each metric along with visual charts.

---

## 8. Managing Your Datasets

### 8.1 Downloads — Viewing Past Datasets

All generated datasets are saved automatically to your account.

**Step 1.** Click **Downloads** in the left sidebar.

**Step 2.** A list of all your generated datasets appears, sorted by date.

**Step 3.** Click on any dataset to open its preview and download options.

### 8.2 Saved Schemas

Save a schema to reuse it later without rebuilding from scratch.

**To save:** In Schema Builder, click **Save Schema**, give it a name, and click **Save**.

**To load:** Go to **Saved Schemas** in the sidebar, find your schema, and click **Load**.

**To generate from a saved schema:** From the Dashboard, use the **Quick Generate** section to select a saved schema and generate immediately.

### 8.3 Deleting a Dataset

**Step 1.** Go to **Downloads**.

**Step 2.** Find the dataset you want to remove and click the trash icon.

**Step 3.** Confirm the deletion.

> **WARNING:** Deleted datasets cannot be recovered. Download your file before deleting.

---

## 9. Frequently Asked Questions

**How many rows can I generate?**  
Between 1,000 and 100,000 rows per dataset.

**How long does generation take?**  
For the LLM and Smart Search flows using CTGAN, generation typically takes 2–5 minutes. The manual schema flow is faster, usually under 30 seconds.

**Can I use SynthCS offline?**  
No. SynthCS requires an internet connection. CTGAN training runs on our servers.

**My validation score is low. What should I do?**  
A low score can happen when the reference dataset is too small (aim for at least 500 rows) or contains many missing values. Try cleaning your reference dataset before importing, or try a different dataset.

**Is my data kept private?**  
Your data is only accessible to your account. SynthCS does not share your data with other users.

**Can I use SynthCS for my thesis?**  
Yes. SynthCS is designed for academic use. In your methodology section, describe your data as *AI-generated synthetic data produced using CTGAN via SynthCS.*

**Can I generate Philippine-context datasets?**  
Yes. Use the **Data.gov.ph** or **PSA** filters in Smart Search, or mention Philippine context in your LLM description. SynthCS will generate Philippine-specific names, addresses, and locations automatically.

**What is the difference between the LLM method and Smart Search?**  
The **LLM method** creates data from an AI-generated schema — no real reference data needed. The **Smart Search method** downloads real data, trains CTGAN on it, and generates synthetic data that statistically mirrors the original. Smart Search produces higher fidelity results.

---

## 10. Troubleshooting

| Problem | What to Try |
|---|---|
| Cannot log in | Check your email and password. Click **Forgot Password** to reset via email code. |
| Verification email not received | Check your spam folder. Click **Resend Verification** on the login page. |
| Search returns no results | Try a simpler or different keyword. |
| Generation does not finish | Wait at least 5 minutes. If it times out, try a smaller row count. |
| Generation fails with an error | Try regenerating. If it persists, try a different reference dataset. |
| Dataset source gives a 404 error | The specific dataset may not be available. Try a different dataset. |
| Download not starting | Check your browser's download settings and make sure pop-ups are not blocked. |
| Page goes blank after generation | Refresh the page and click **Downloads** to find your dataset. |
| Validation score is 0% | The reference dataset may have been too small or too uniform for meaningful validation. |

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Synthetic Data** | Artificially generated data that statistically resembles real data but was not collected from real people or events |
| **Reference Dataset** | The real data file that SynthCS learns from to generate your synthetic dataset |
| **CTGAN** | Conditional Tabular GAN — the deep learning model that generates synthetic tabular data |
| **GAN** | Generative Adversarial Network — the type of AI architecture CTGAN is based on |
| **Gaussian Copula** | A statistical method used to preserve correlations between columns when generating data |
| **Schema** | The structure of a dataset — the list of columns, their data types, and their rules |
| **LLM** | Large Language Model — the AI used in SynthCS to generate schemas from plain English descriptions |
| **TSTR** | Train on Synthetic, Test on Real — a method for evaluating whether synthetic data is useful for ML training |
| **Wasserstein Distance** | A statistical measure of how different two value distributions are from each other |
| **Pearson Correlation** | A measure of the linear relationship between two columns |
| **Distribution Similarity** | How closely the value patterns in a synthetic column match the original |
| **Anomaly Injection** | Intentionally adding outliers, noise, or missing values to simulate real-world data quality issues |
| **Temporal Rules** | Settings that add time-based patterns (trends, seasonality) to date columns |
| **Relational Rules** | Column dependency rules that ensure logical consistency between fields |
| **Epoch** | One complete pass of the training data through the CTGAN model |
| **Cardinality** | The number of distinct values a categorical column will have |
| **CSV** | Comma-Separated Values — a standard file format for tabular data |
| **JSONL** | JSON Lines — a format where each line is a separate JSON record |

---

## 12. Contact and Support

For technical issues, contact your system administrator or thesis adviser.

| | |
|---|---|
| **Research Adviser** | Johniel Zar Mendoza |
| **Technical Adviser** | Arthur Tristan Ramos |
| **Thesis Adviser** | Dr. Erlinda Cassiela Abarintos |
| **Institution** | Gordon College — College of Computer Studies |
| **Location** | Olongapo City, Philippines |
| **Website** | synthcs.site |

---

*Synthetic Data. Real Results.*  
*SynthCS — Gordon College CCS © 2026*
