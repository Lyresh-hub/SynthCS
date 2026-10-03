# Activity & System Logging in SynthCS

The activity history is no longer only about flagged prompts. It is a structured log of everything users and the system do. Each entry has a **severity level**, following the approach of AWS CloudWatch Logs and Grafana Loki.

## 1. Reference model: CloudWatch and Grafana

| Practice in CloudWatch / Grafana | How SynthCS applies it |
|---|---|
| **Structured log events.** Each event has fields (timestamp, level, source, message, attributes), not just free text. | Every entry stores `level`, `category`, `action`, the actor, a readable `message`, `source` (server or browser) and a `details` object with the context. |
| **Severity levels** (the syslog ladder: DEBUG → INFO → WARN → ERROR → FATAL). | SynthCS uses the three levels that matter to an instructor or admin: **INFO**, **WARN** and **ERROR**. DEBUG is too noisy for this audience. |
| **Log Insights / Explore.** Filter by level, time range, field and free text. | The log viewer has level counters that also act as filters, a category filter, a time range (1 h to all time), text search, newest/oldest order and 30-second live refresh. |
| **Stat panels** showing counts per level. | Three counters (Info / Warning / Error) at the top of the log viewer. |
| **Alarms on state change,** e.g. a health check going from OK to ALARM. | A health monitor checks the Python generation service every 5 minutes. It logs **only changes**: ERROR when the service goes down, INFO when it recovers, WARN when it is very slow. |
| **Retention policies.** | Routine INFO entries are kept for 180 days; WARN and ERROR entries for 365 days. |
| **Logs also sent to stdout** for the platform's collector. | Every event is also printed as one JSON line, so the hosting platform's logs (Railway, or CloudWatch/Loki if deployed there) contain the same data. |

## 2. What the levels mean

| Level | Meaning | Examples |
|---|---|---|
| **INFO** | Normal activity | Student logged in · searched datasets · generated a dataset · downloaded or exported · joined a class · instructor approved a prompt |
| **WARN** | Something potentially problematic that can still be fixed | Failed login (wrong password, unverified, banned) · prompt flagged or blocked · daily quota reached · attempt to open a locked dataset · upload rejected (bad file) · slow request or slow generation · email not sent · AI detection down (rule fallback used) · generation service slow |
| **ERROR** | An actual failure | Request crashed (HTTP 5xx, with the real error message) · dataset generation failed · export failed · generation service unreachable · unhandled server exception |

The **server** decides the level of every event. The browser can report events that happen on the student's device, such as an export or a failed generation, but it can only name *what happened*. It cannot choose the severity, and it cannot report moderation events such as "prompt approved".

## 3. What is recorded, and why it helps

| Category | Events | Useful to the instructor or admin because… |
|---|---|---|
| **Login & accounts** | login success/failure (with reason and method), logout, signup, email verified, password reset requested | Shows who is active, and spots repeated failed logins or students stuck at "unverified" or "awaiting approval" |
| **Classes** | join request (invite link or email), approval/rejection, leaving a class, invite links created, restrictions added/removed | Explains why a student can or cannot see class features; audit trail of instructor changes |
| **Search** | dataset search, AI search (original prompt), searches with no results | Shows what students are looking for, and where the system fails to find data for them |
| **Generation** | schema generated, dataset generated (rows, source, purpose, category, locked or not), slow generation, failed generation (step and error) | Tells the instructor whether a student actually produced their dataset, or hit a technical problem that isn't their fault |
| **Datasets** | upload (file, size, tables and relationships detected), upload failure, preview, export (format), download, delete, attempt to open a locked dataset | Complete lifecycle of each dataset, from creation to what the student took away |
| **Moderation & review** | prompt flagged (which trigger), blocked, resubmission of a rejected prompt, quota reached, approvals and rejections, AI detection unavailable | Context for review decisions; repeated attempts become visible |
| **System** | server start, crashed requests, slow requests, generation service down/slow/recovered, emails not sent, unhandled errors, log retention | Separates "the student did something wrong" from "the system had a problem" |

**Context stored with each event** (where it applies): who did it and their role; the exact prompt; dataset name, row count, source and ID; the step that failed and the error message; duration; route and HTTP status; the page it came from; the device or browser; the purpose and category the student declared; and the review ID and lock status.

## 4. Who sees what

| Viewer | Scope |
|---|---|
| **Instructor** (Instructor Panel → Activity) | **Only** the activity of students enrolled (approved) in their classes. The instructor is identified by their login session, not an ID in the request. |
| **Admin** (Admin → Classes → Activity & System Logs) | Everything: all students, instructors' own actions, admins, failed logins for unknown accounts, and all system events |

## 5. Where it lives in the code

- `backend/logger.js`: the event catalog (level, category and message for each action) and the logger
- `backend/server.js`:
  - automatic capture of crashed and slow requests
  - the health monitor and retention
  - the log query endpoints `/instructor/logs` and `/api/admin/logs`
- `src/components/LogViewer.tsx`: the log explorer used by both panels
- `src/lib/activity.ts`: browser-side event reporting
