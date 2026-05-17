# SynthCS — Schema Builder Features

This document explains what each feature in the Schema Builder does, why it exists, and how a user is expected to use it. It is written to be understood by non-technical stakehold[text](vscode-webview://0ljqnh9lqe25mbk0mrftob7ikhi6it95s31r8kisks5pbon9hmtv/docs/schema-builder-features.md)ers.

---

## What is the Schema Builder?

The Schema Builder is the main page of SynthCS where users create and customize synthetic datasets. A user starts by either searching for an existing real-world dataset or describing what kind of data they need in plain English. The system then builds a schema — a blueprint of columns, data types, and rules — which the user can review and adjust before generating the actual data.

The Schema Builder has two entry paths:

| Path | When to use |
|------|-------------|
| **External Dataset Sources** | The user wants to find a real dataset from a known source and generate synthetic data based on it |
| **LLM Prompt** | The user describes their dataset in plain English and the system finds the best real-world match, then fills in any missing parts with AI |

---

## 1. Generation Modes

**What it is:** Before generating data, the user selects what the data will be used for. This choice changes how the system generates values — the ranges, distributions, and types of content it produces.

**Why it exists:** The same column name like "status" or "label" means something very different depending on context. A fraud detection dataset needs a label column with mostly non-fraud records (since real fraud is rare). A cybersecurity dataset needs IP addresses and attack types. A stress test dataset needs extreme values and edge cases. Selecting a mode tells the system what realistic data looks like for that purpose.

**The four modes:**

| Mode | Purpose | When a user would pick this |
|------|---------|----------------------------|
| **Mock Data** | Realistic everyday data for development and testing | A developer who needs realistic users, orders, or contacts to test an application |
| **AI Training** | Labeled datasets ready for training machine learning models | A data scientist who needs labeled examples for fraud detection, churn prediction, or intent classification |
| **Cybersecurity** | Data that simulates network traffic, attack patterns, and security events | A security researcher or student training an intrusion detection system |
| **Stress Testing** | High-volume data with edge cases, errors, and extreme values | A developer testing whether their system handles crashes, timeouts, and abnormal inputs |

**Built-in Presets:** Each mode includes ready-made templates so users do not have to build a schema from scratch. For example, under AI Training there are presets for "Fraud Detection," "Churn Prediction," and "Chatbot Intent." Clicking a preset fills in the entire schema automatically — the user just sets the row count and generates.

---

## 2. External Dataset Sources

### Unified Search Bar

**What it is:** A single search bar that searches all six supported dataset platforms at the same time — Kaggle, Hugging Face, UCI ML Repository, OpenML, Data.gov.ph, and PSA.

**Why it exists:** Before this feature, users had to know which platform to search on and pick a tab first. Many users do not know that UCI is better for academic benchmarks or that Data.gov.ph has Philippine government data. By searching everything at once, the user just types what they need and sees all available matches regardless of where they live.

**How it works:** When the user types a query, the system first asks an AI (Claude Haiku) to think of related terms for that topic — for example, "student performance" expands to "academic achievement," "grades," "attendance," "GPA," etc. All of those terms are then searched across all six platforms simultaneously. This ensures that even if a dataset is not named exactly what the user typed, it still shows up in the results.

**How to use it:** Type a topic (e.g., "employee salary," "diabetes prediction," "Philippine poverty") and press Search. Results from all sources appear in one list.

### Source Filter Chips

**What it is:** After results load, colored tags appear above the list — one for each source that returned results. Clicking a tag narrows the results to just that source.

**Why it exists:** When a search returns 20+ results from 5 different sources, it can be overwhelming. The filter chips let users quickly focus on just Kaggle results, or just Philippine government data, without redoing the search.

**How to use it:** After searching, click a colored chip (e.g., "UCI," "Kaggle") to filter. Click "All" to go back to the full list.

### Expandable Dataset Preview

**What it is:** Each search result has a dropdown arrow on the right. Clicking it reveals the dataset's actual column names, data types, and a sample of 3 real rows from the dataset.

**Why it exists:** Dataset titles and descriptions are often vague or misleading. A user searching for "student data" might find a dataset that is actually about student loan debt, not academic performance. The preview lets users see exactly what columns and values exist before committing to download and use it.

**How to use it:** Click the chevron (▼) on any result row. Then click "Preview dataset columns" to fetch a live sample. Once loaded, column chips and a sample table appear. Click "Use Dataset" if it looks right.

### Multi-Dataset Combine

**What it is:** Each result row has a checkbox. The user can check two or more datasets and combine them into a single schema.

**Why it exists:** Sometimes no single dataset has all the columns a user needs. For example, a user might find one dataset with good demographic fields and another with good financial fields. Combining them produces a richer schema than either dataset alone.

**How to use it:** Check the checkboxes on two or more results. An action bar appears at the bottom with a "Combine N Datasets" button. The system merges their schemas — duplicate column names are only kept once, and merged fields are visually tagged with which source they came from.

---

## 3. LLM Prompt (AI-Assisted Generation)

### What it is

The user types a plain-English description of the dataset they want. The system interprets it, searches for real-world datasets that match, and uses AI to fill in any fields the real data is missing.

**Example prompt:** *"Generate employee payroll records where salary depends on role, department, and years of experience"*

### Smart Hybrid Search

**Why it exists:** Purely AI-generated data tends to have made-up patterns — hallucinated salary ranges, unrealistic distributions, or fake-looking values. By finding a real dataset first and using it as the foundation, the generated data is grounded in how real data actually looks. The AI only adds what is genuinely missing, rather than inventing everything.

**How it works:**
1. The system searches all dataset sources for real matches, the same way the external search does.
2. If real datasets are found, they are shown to the user for selection.
3. If nothing is found, the system falls back to pure AI generation using only the prompt.

### Smart Results Panel

**What it is:** The list of real datasets the system found that best match the user's prompt.

**Why it exists:** The user needs to choose which real dataset to use as the foundation. Different datasets may have different columns, quality, or relevance — the user should be able to compare before committing.

**How to use it:** Browse the results. Expand any row to preview its actual columns and sample rows. The label "Real columns — AI will build on these" shows which fields come directly from the real data. Click "Use as AI base — generate schema from this" to proceed with that dataset.

### LLM Augmentation

**What it is:** After the user picks a real dataset, the AI analyzes the user's original prompt and identifies which fields it asked for that are not in the real dataset. Those missing fields are generated by AI and added to the schema alongside the real ones.

**Why it exists:** Real datasets rarely have every column a user needs. A payroll dataset might have employee ID, name, and department, but not a "performance_rating" column the user's prompt mentioned. Rather than forcing the user to add those manually, the AI detects the gap and fills it in automatically.

**How fields are labeled in the schema:**
- **No badge (white)** — real columns pulled directly from the source dataset
- **Yellow badge** — columns added by the AI because they were missing from the real data
- **Blue badge (source name)** — columns merged in from a secondary dataset

### Multi-Dataset Merge (LLM Flow)

**What it is:** From the Smart Results panel, the user can select multiple datasets and merge them before letting the AI augment. The resulting schema combines real fields from all selected datasets.

**Why it exists:** One dataset might have the demographic columns, another the behavioral columns. Merging gives the AI a richer real-data foundation to build on, reducing how much it needs to invent.

### Prompt Domain Detection

**What it is:** The system scans the user's prompt for specific topic keywords (hospital, payment, fraud, enrollment, lab results, etc.) and explicit phrasing like "with X" or "including Y fields."

**Why it exists:** Users often mention a specific domain in passing — e.g., "student records with hospital visits." The word "hospital" signals that the system should add medical fields even if the base dataset does not have them. Detecting this automatically means the user does not have to remember to add those fields manually.

---

## 4. Schema Editor

**What it is:** The core editing interface where users review and customize the columns (fields) of their dataset before generating.

**Why it exists:** No automated system — whether a real dataset or an AI — produces a perfect schema on the first try. The schema editor gives the user full control to rename columns, change types, set value constraints, delete irrelevant fields, or add new ones.

### Fields and Their Properties

Each column in the schema shows:

| Property | What it controls |
|----------|-----------------|
| **Name** | The column header in the output file |
| **Type** | The kind of data generated (text, number, date, email, phone, etc.) |
| **Null rate** | How often the column should be blank (0% = never blank, 50% = half the rows blank) |
| **AI Suggest** | Clicking the sparkle icon asks the AI to recommend the best type, description, and constraints for that field name |

### Advanced Constraints (per field)

Expanding a field reveals fine-grained controls:

| Constraint | What it does |
|-----------|--------------|
| **Min / Max** | Forces numeric values to stay within a range (e.g., age between 18 and 65) |
| **Distribution** | Controls how values are spread — uniform (even), normal (bell curve), or skewed |
| **Enum values** | Restricts a text column to a specific list of allowed values (e.g., "Active, Inactive, Suspended") |
| **Cardinality** | Limits how many unique values a text column can have |
| **Date range** | Sets the earliest and latest allowed date for a date column |
| **True ratio** | For yes/no fields, controls what percentage of rows should be "yes" (e.g., 2% fraud rate) |

### Foreign Keys (Linking Tables)

**What it is:** A way to connect a column in one table to a column in another table.

**Why it exists:** Real databases have related tables — an Orders table references a Customers table by customer ID. If the synthetic Orders table generates random customer IDs that do not exist in the Customers table, the data is not usable. Foreign keys ensure the generated IDs actually match between tables.

**How to use it:** On any field, set the FK Table and FK Field to point to the column it references. The generator will only produce values that exist in the referenced column.

---

## 5. Multi-Table Generation

**What it is:** The ability to define and generate multiple related tables at once, rather than one table at a time.

**Why it exists:** Real-world systems almost always store data in multiple linked tables — employees, departments, payroll, attendance. Generating each table separately means the IDs and relationships between them will not match up. Multi-table generation keeps everything consistent.

**How to use it:**
- Use the table tabs at the top to add, remove, and switch between tables.
- Each table has its own fields and its own row count.
- Click **Preview** to see 10 sample rows per table before generating the full dataset.
- On confirming the preview, select a format and click Download.

### Download Format

| Format | What you get |
|--------|-------------|
| **CSV** | A ZIP file with one `.csv` file per table — opens in Excel, Google Sheets |
| **JSON** | A ZIP file with one `.json` file per table — used by developers and APIs |
| **XLSX** | A single Excel file with one sheet per table — easiest for non-technical users |

---

## 6. Behavioral Consistency (HR and Payroll)

**What it is:** A set of automatic rules the generator follows when a schema contains HR-related fields like job role, salary, bonus, experience, or hire date.

**Why it exists:** Without this, the generator might produce an Intern with a $104,000 salary and 26 years of experience, or a Director hired in 2023 but listed with 2 years of experience and a $28,000 salary. These values are internally contradictory. Real HR data has causal relationships — salary depends on role and experience, experience depends on hire date. Behavioral consistency enforces those relationships automatically.

**What it enforces:**
- Salary is calculated from the employee's role, years of experience, and department — a Director always earns significantly more than an Intern
- Bonus amounts are tied to role seniority
- Years of experience is derived from the hire date, not randomly assigned
- Benefits reflect the employee's employment type and level

This works even when the role is in one table (e.g., `employees`) and the salary is in a separate table (e.g., `payroll`) — the system links them through the foreign key relationship.

---

## 7. Advanced Generation Options

These options are available under the **Advanced** toggle and provide fine-grained control over how data is generated.

### Temporal Configuration

**What it is:** Controls the behavior of date and timestamp columns to make them realistic over time.

**Why it exists:** A log dataset where all events have the same timestamp, or where events appear in random order, does not reflect how real logs look. Temporal configuration makes time-based data behave naturally.

**Options:**
- Set a date range (e.g., January 2023 to December 2024)
- Restrict events to business hours only (e.g., 8 AM – 6 PM on weekdays)
- Enforce ordered timestamps so events appear in chronological sequence
- Specify which columns should be treated as time columns

### Relationship Rules

**What it is:** User-defined IF–THEN rules that link values across columns.

**Why it exists:** Sometimes column values must logically depend on each other in ways the system cannot infer automatically. For example, if an order status is "Cancelled," the refund amount should be greater than zero. Without a rule, the generator might produce a Cancelled order with no refund, which is inconsistent.

**Example rule:** `IF status = "Cancelled" THEN refund_amount > 0`

**How to use it:** Click "Add Rule" in the Advanced panel. Choose the IF column, the condition, the THEN column, and the resulting constraint.

### Anomaly Injection

**What it is:** Intentionally inserts bad, unusual, or corrupted records into the dataset at a controlled rate.

**Why it exists:** Developers and researchers testing anomaly detection systems need datasets that contain both normal and abnormal records. If the dataset is perfectly clean, there is nothing for the detection algorithm to find.

**Options:**
- Toggle on/off
- Set the anomaly rate (e.g., 5% of rows will be anomalous)
- Choose the types: null spikes (unexpected blank values), outliers (extreme numbers), duplicates (repeated rows), corrupted values (garbled text), or format errors (e.g., invalid email addresses)

---

## 8. Data Generation Pipeline

The generation process works differently depending on which path the user took. The core thesis of SynthCS is **CTGAN and LLM Augmented Tabular Dataset Generation** — CTGAN is the primary generation engine, and the LLM is the schema augmentation layer. These two components work together on the External Dataset path. The pure LLM fallback path is a separate, independent path that does not involve CTGAN.

### LLM Path — Sub-path A: AI Augmented (real dataset found)

This is the primary and preferred LLM path. It fully satisfies the thesis title.

1. **Smart Search** — The system searches all six dataset sources using query expansion. A real dataset matching the prompt is found and downloaded.
2. **LLM Augmentation** — The AI compares the real dataset's columns against the user's prompt and adds any missing fields as yellow "AI Added" fields. The real columns stay white.
3. **CTGAN Generation** — The real downloaded dataset is used as training data for CTGAN. CTGAN learns the statistical distributions and column correlations from the real data, then generates new rows that are statistically similar but contain no original records. This is the same pipeline as the External Dataset Path below.

### LLM Path — Sub-path B: Pure LLM Fallback (no real dataset found)

This path is only triggered when no real dataset is found across all six sources. It is the fallback, not the primary path.

1. **LLM Schema Generation** — The AI generates a full schema from the user's prompt, including field names, types, and value constraints.
2. **Generate Template** — The system produces 200 Faker-generated rows from the schema. These are synthetic rows built from the field definitions, not from real data.
3. **Scale with Gaussian Copula** — The 200-row template is scaled up to the user's requested row count using a Gaussian Copula statistical model — **not CTGAN**.

   **Why Gaussian Copula and not CTGAN here?** CTGAN is a deep learning model that needs real, meaningful data to learn from. A 200-row Faker-generated template contains no real statistical patterns — the values are procedurally generated from constraints. Training CTGAN on artificially constructed data would cause it to learn noise rather than real-world distributions, producing worse results than a simpler statistical method. Gaussian Copula is appropriate here because it simply preserves the correlation structure and marginal distributions of the template as-is, which is the correct behavior for scaling up a schema-defined seed dataset.

   **Relationship to the thesis title:** The thesis title "CTGAN and LLM Augmented Tabular Dataset Generator" refers to the primary pipeline — where LLM augmentation enriches a real dataset's schema and CTGAN generates from it. The pure LLM fallback path is a robustness mechanism for cases where no real dataset exists, and it uses a classical statistical method as the most appropriate tool for that specific situation. CTGAN is not bypassed by design choice — it is inapplicable when there is no real training data.

### External Dataset Path (real dataset base)

When a user starts from a real dataset (manual search, Kaggle, HuggingFace, UCI, OpenML), the template step is skipped entirely. The real dataset is used directly as training data for CTGAN, which generates new rows that statistically resemble the original data without copying any real records. 80% of the dataset is used for CTGAN training; 20% is held out as a test set for the validation metrics endpoint.

---

## 9. Saved Schemas

**What it is:** A save button (disk icon) in the schema editor that stores the current schema to the user's account.

**Why it exists:** Users often need to generate the same type of dataset repeatedly — for example, a researcher who generates new student performance data each semester. Saving the schema means they do not have to rebuild it from scratch each time.

**How to use it:** Click the save icon while in the schema editor. The schema is saved under the user's account and can be loaded from the Saved Schemas page. Loading it brings the user directly back to the schema editor with all fields restored.

---

## 10. AI Field Suggestion

**What it is:** A sparkle (✦) button on each field in the schema editor. Clicking it asks the AI to recommend the best data type, description, and value constraints for that field based solely on its name.

**Why it exists:** Users who build schemas manually often have to guess what type a field should be, what range is realistic, or what enum values make sense. For well-known field names like `salary`, `hire_date`, `email`, `product_category`, or `student_id`, the AI can confidently fill these in — saving the user significant configuration time.

**How to use it:** Type a field name, then click the sparkle icon. The AI fills in the type and constraints. The user can accept them as-is or override anything.
