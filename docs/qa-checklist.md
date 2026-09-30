# ✅ SIMPLE CHECKLIST FOR YOUR TEAM — QA Testing

Tick each box only when the **Expected** result actually happens. If something fails, write down what you did, what you expected, what happened instead, and attach a screenshot.

---

## 0. Before testing (setup)

- [ ] Latest backend (Node on Railway) and generation service (Python on HF Spaces) are deployed.
- [ ] The Anthropic API key has credits or usage left, so AI detection (Level 2) is working.
- [ ] The HF Space can reach the Node backend. It uses the Railway URL by default; set `NODE_API_URL` only if that URL changed.
- [ ] Test accounts are ready. From the `backend` folder, run `node scripts/seed-test-accounts.js` with the production `DATABASE_URL` set (add `QA_PASSWORD=...` to choose the password, or it prints a random one). Re-running resets the accounts; adding `--wipe-activity` also clears their flags, datasets and logs for a fresh round. Write the password in the team's private notes, not in the manuscript.
- [ ] The QA addresses have no real inboxes. To test approval/rejection **emails**, use a real student account for that step.

| Account | Purpose |
|---|---|
| `qa.admin` | Admin: sees every log and all system events |
| `qa.instructor1` (Class A) | Reviews flags, sets restrictions |
| `qa.instructor2` (Class B) | Checks that instructors only see their own students |
| `qa.student1` | Normal student, enrolled in Class A |
| `qa.student2` | Enrolled in **both** Class A and Class B (multi-class) |
| `qa.student3` | Used for rejections and strikes (will get banned at 3 strikes) |
| `qa.student4` | Unverified or pending-approval account (tests login warnings) |

---

## 1. Activity ordering

- [ ] Do 3 actions in a row as `qa.student1`: search, generate, download. **Expected:** the instructor's Activity tab lists them in that exact order, with full date and time (to the second).
- [ ] Switch **Newest / Oldest**. **Expected:** the order flips and matches what really happened.
- [ ] Do an action as `qa.student2`. **Expected:** it appears for **both** instructors, but a `qa.student1` action does **not** appear for `qa.instructor2`.
- [ ] Type a prompt with extra spaces or odd casing. **Expected:** the log shows it exactly as typed (unedited).

## 2. Approval / rejection (Pending → Approved / Rejected)

**Pending**
- [ ] As a student, search or generate with a flagged prompt (e.g. "credit card numbers"). **Expected:** a yellow "🔒 Pending instructor review — dataset locked" banner appears.
- [ ] Keep going and generate the dataset. **Expected:** generation works, but the Preview page shows "Locked — waiting for instructor approval" and no rows.
- [ ] Try every export format (CSV, JSON, JSONL, SQL, XLSX). **Expected:** all are blocked.
- [ ] Open My Downloads. **Expected:** the dataset shows "🔒 Pending approval" / "Locked until approved", with no Preview or Download buttons.
- [ ] As the instructor, open the Flagged tab. **Expected:** the flag shows "🔒 1 generated dataset is locked…" and says exactly which word triggered it.

**Approved**
- [ ] Instructor approves. **Expected:**
  - The student's banner turns green within about 20 seconds.
  - Preview and download work.
  - The student gets the approval email.
  - Submitting the same prompt again is **not** flagged.

**Rejected**
- [ ] Instructor rejects a different flagged prompt. **Expected:**
  - Banner shows "✗ Rejected — access denied".
  - The schema is cleared from the Schema Builder.
  - My Downloads shows "⛔ Rejected / Access denied".
  - The student gets 1 strike.
- [ ] Student resubmits the **same** rejected prompt. **Expected:** refused with "already rejected".
- [ ] Instructor approves first, then later rejects the same prompt. **Expected:** rejection wins and the dataset is locked again.
- [ ] Reject `qa.student3` three times. **Expected:** the account is banned and can no longer log in.

## 3. AI flagging / detection

Use **Instructor → Restrictions → Test a prompt** for quick checks, then confirm a few directly in the Schema Builder as a student.

**Reviewer's words.** Each one must be flagged:
- [ ] `corrupt` · `corrupted records` · `corruption in the barangay` · `CORRUPT`
- [ ] `manipulate` · `manipulating` · `manipulation` · `stock price manipulation` · `m a n i p u l a t e` · `man1pulate`
- [ ] `fishing` · `fishing emails` · `fishing links` · `fishing attack`
- [ ] `credit card` · `Credit-Card` · `creditcard` · `credit_card numbers` · `cr3dit card`

**Other variations.** Must be flagged:
- [ ] `ph1shing`, `fr@ud`, `h4ck`, `fraudulent`, `scammer`, `bribery`, `falsified grades`, `fake transcript`, `my classmates' home phone numbers`, `changing grades`

**Must NOT be flagged:**
- [ ] `fishing boat catch by species in Bataan`, `hackathon registrations`, `generate fake customer names for testing`, `student grades and attendance`

**How the flag is explained**
- [ ] Every flag shows **which level** fired (Level 1 instructor word / Level 2 AI / Level 3 system word) and the **exact word matched**.
- [ ] Test the fallback: turn off AI in the test tool (or test while the AI key is out of quota). **Expected:** the reviewer's words are still flagged, with "AI detection unavailable — flagged by rule-based fallback".
- [ ] Level 2 AI (needs a working key): `records showing which professors can be pressured` is flagged even though it contains no listed word.

**Instructor trigger words (Level 1)**
- [ ] Instructor adds `gambling` as **Flag**. **Expected:** `online GAMBLING`, `gamble` and `gambling` are flagged.
- [ ] Instructor adds `exam answers` as **Block**. **Expected:** `exam-answers` and `examanswers` are refused outright.
- [ ] Generate from a dataset whose **column names** contain an instructor word (e.g. a `gambling_losses` column). **Expected:** it is flagged even if the prompt is clean.

## 4. Activity history levels (INFO / WARNING / ERROR)

- [ ] Login, logout, search, generate, preview, export, download and delete each create an **INFO** entry with a readable message.
- [ ] Wrong password, unverified login (`qa.student4`) and a flagged prompt each create a **WARNING** with the reason.
- [ ] Upload an invalid file (e.g. a renamed `.exe` or an empty CSV). **Expected:** a **WARNING** "Upload … failed".
- [ ] Stop or put to sleep the Python service, then generate. **Expected:** an **ERROR** "Failed while …" for the student; within 5 minutes an **ERROR** "Generation service (Python) is unreachable"; and an **INFO** "back online" after restarting it.
- [ ] Click the Info / Warning / Error counters. **Expected:** they filter the list. The category, time-range and search filters work, and **Live** refreshes every 30 seconds.
- [ ] Click a row. **Expected:** full details appear (prompt, dataset, step, error, duration, page, device).
- [ ] The instructor sees only their students, their own actions and system errors. **Admin → Classes → Activity & System Logs** shows everything, including failed logins for non-existent emails.

## 5. Uploads & related tables (earlier revision)

- [ ] Upload works for CSV, TSV, XLSX, JSON, JSONL, Parquet and ZIP.
- [ ] Upload a ZIP or multi-sheet Excel with related tables (e.g. customers / orders / order_items). **Expected:** all tables load, with a blue banner listing the detected links (e.g. `orders.customer_id → customers.customer_id`).
- [ ] Generate from that dataset. **Expected:** every foreign-key value in the output exists in its parent table.

## 6. Try to break it (aggressive / loophole testing)

Test like someone trying to cheat the system. Each of these should **fail safely**:

- [ ] Copy a locked dataset's download link (`…hf.space/api/download/<id>`) and open it directly in a new tab or incognito. **Expected:** "locked", no file.
- [ ] While locked, open `…/api/preview/<id>` and `…/api/validate/<id>` directly. **Expected:** locked.
- [ ] Get flagged, then retype the prompt with a small change (extra spaces, capitals, `credit-card` instead of `credit card`). **Expected:** still flagged.
- [ ] Get flagged, then dismiss or refresh the page, log out and back in, or open a new tab. **Expected:** the dataset is still locked.
- [ ] After rejection, try to regenerate from the cleared schema or reload an old draft. **Expected:** no unlocked copy is produced.
- [ ] Put the trigger word only in the dataset columns, not in the prompt. **Expected:** caught (Level 1).
- [ ] Disguise words: `c.r.e.d.i.t card`, `phish1ng`, `m@nipulate`. **Expected:** flagged.
- [ ] Try to fake a log entry through the browser console (e.g. POST `/api/activity/log` with `action_type: "prompt_approved"`). **Expected:** refused ("Unknown action_type").
- [ ] As `qa.instructor2`, try to view `qa.student1`'s activity. **Expected:** not visible.
- [ ] Very long prompt (5,000+ characters), emoji, other languages, or SQL-looking text (`'; DROP TABLE users;--`). **Expected:** no crash; logged correctly.
- [ ] Double-click Generate or Approve quickly. **Expected:** no duplicate reviews or datasets, no errors.
- [ ] Upload a 100 MB+ file or a ZIP with no tables inside. **Expected:** a clear error message, not a crash.
- [ ] Two students generating at the same time. **Expected:** both finish, and each log belongs to the right student.

## 7. Team tasks (not QA tests, but due before the next consultation)

- [ ] **Scalability:** check how the system handles more students, requests, datasets and logs (e.g. 30+ students generating at once). Record the results.
- [ ] **Stakeholders:** interview the intended users (instructors and students) about how they would use the system if it were implemented, and write down their requirements.
- [ ] **Broader research:** add related systems and approaches (e.g. CloudWatch/Grafana for logging, other synthetic-data and moderation tools) to the review of related literature.
- [ ] **Revision list:** keep it updated, and assign each reviewer comment to its owner on the team.
- [ ] Test accounts ready and shared with the team.
- [ ] After all boxes above are ticked, request the next consultation.
