# Part 3: Try to Break It — Step-by-Step (SynthCS, local setup)

## Before you start

- Run all three services: backend (`localhost:5000`), Python (`localhost:8000`), and the website (`localhost:5173`).
- Use **two browsers or windows**: a normal window for **Student A** (`qa.student1`) and an incognito window for **Student B** (`qa.student2`). Keep a third, private window for "logged out".
- Use the test files in `docs/qa-test-files/`.
- Open **DevTools** (F12) to use the **Console** tab (to type commands) and the **Network** tab (to see requests).
- After each test, check the result in **Admin → Classes → Activity & System Logs** (log in as `qa.admin`).
- Record every result in a table like this:

| # | Test | Expected | What happened | Pass / Fail | Screenshot |
|---|---|---|---|---|---|

> **Important: how SynthCS identifies users.** SynthCS does not use login tokens. After login, the browser keeps your user ID (Local Storage → `user_id`) and sends it with requests, and the server trusts it. Dataset IDs are long random codes (UUIDs), not numbers. Tests 2, 3, 5 and 13 are written for this setup.

---

## 1. Locked dataset, direct link

1. As **Student A**, search for a flagged prompt (e.g. `credit card numbers`) and generate a dataset. It becomes **locked** (pending review).
2. Go to **My Downloads**. The row says *Locked until approved*, with no Download button. Do one of these:
   - Generate one **unflagged** dataset first, right-click its **Download** button → **Copy link address**. It looks like `http://localhost:8000/api/download/<long-id>`.
   - Or find the locked dataset's ID: **Network** tab → click the `datasets/<your-id>` request → **Response** → `python_dataset_id` of the locked row. Build the link `http://localhost:8000/api/download/<that id>`.
3. Paste the **locked** dataset's link into the **logged-out** window, then into **Student B's** window.
4. **Expected:** both show `"locked": true, "review_status": "pending"` and no file is downloaded.
5. Repeat with `/api/preview/<id>` and `/api/validate/<id>`. **Expected:** locked.
6. Check the logs for a WARNING.

> ⚠️ **Likely finding:** opening the raw link directly does **not** create a log entry. The WARNING is only logged when the Preview **page** is opened. Python can't write to the activity log.

## 2. Changing the ID

IDs here are random codes, so +1 / −1 doesn't apply. Instead, try someone else's real ID:

1. As **Student B**, generate an unflagged dataset. Copy its download link (as in test 1).
2. As **Student A**, paste Student B's link. **Expected (per the rule):** blocked.
3. Also try listing another student's datasets. As Student A, open `http://localhost:5000/api/datasets/<Student B's user_id>`. Get Student B's ID from B's window: DevTools → **Application** → **Local Storage** → `user_id`.
4. Try changing one character of a real ID. **Expected:** "not found", no crash.

> ⚠️ **Likely finding:** steps 2–3 **succeed**. Anyone with a dataset's link can download it, and anyone who knows a user ID can list that user's datasets.

## 3. API without login

There is no Authorization header to remove. Replay a request while logged out instead:

1. As **Student A**, open **Network**, then go to **My Downloads**. Find the request `datasets/<id>` → right-click → **Copy** → **Copy as fetch**.
2. Open the **logged-out** window at `localhost:5173`, open the **Console**, paste, and press Enter.
3. Do the same with an instructor request (`instructor/logs?instructor_id=…`) and an admin request (`api/admin/logs?admin_id=…`).
4. **Expected (per the rule):** refused.

> ⚠️ **Likely finding:** all of them work while logged out. The server only checks the ID in the request. This is the **biggest hole**, and the root cause of tests 2, 5 and 13.

## 4. Disguised words

Fastest method: **Instructor → Restrictions → Test a prompt** (shows exactly what was matched). Then confirm a few as a student.

Try each, and record **Flagged? / Which level / Matched word**:

| Type | Try |
|---|---|
| Mixed case | `CrEdIt CaRd`, `MaNiPuLaTe` |
| Spaces | `c r e d i t card`, `m a n i p u l a t e` |
| Symbols / numbers | `cr3d!t card`, `m@nipul4te`, `ph1sh1ng`, `fr@ud` |
| Dots / dashes / underscores | `c.r.e.d.i.t card`, `credit-card`, `credit_card` |
| No space | `creditcard`, `phishingemails` |
| Misspelling | `fishing emails`, `manipulte`, `corupt` |
| Tagalog | `pandaraya`, `dayain ang survey`, `nakaw na credit card`, `manloloko`, `pekeng ID`, `suhol` |
| Inside a sentence | `help me manipulate my classmates' grades` |

> Expected: most English variations are caught by the rules. **Tagalog words and misspellings like `manipulte` will likely get through the rules**; only the AI (Level 2) may catch them. Write down exactly which ones pass.

## 5. Faking a log from the browser

1. Log in as **Student A** and open the **Console**.
2. Get another user's ID (e.g. Student B's `user_id` from B's Local Storage).
3. Paste and run each of these, replacing `<B-ID>`:

```js
// a) made-up event type
fetch("http://localhost:5000/api/activity/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:"<B-ID>",action_type:"admin_deleted_everything",details:{}})}).then(r=>r.json()).then(console.log)

// b) real event, but pretending to be Student B, with a fake level and time
fetch("http://localhost:5000/api/activity/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:"<B-ID>",action_type:"logout",details:{level:"ERROR",created_at:"2020-01-01T00:00:00Z"}})}).then(r=>r.json()).then(console.log)

// c) pretending the instructor approved something
fetch("http://localhost:5000/api/activity/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:"<B-ID>",action_type:"prompt_approved",details:{}})}).then(r=>r.json()).then(console.log)
```

4. **Expected:** (a) and (c) are refused with `Unknown action_type`. In (b), the log shows **INFO** (not ERROR) with **today's** time.

> ⚠️ **Likely finding:** (b) is **accepted as Student B**. The browser can't fake the level, time or event type, but it can fake *who* did it.

## 6. Log with line breaks

Dataset names come from the table name, and that input box can't hold a line break, so use the Console (logged in as Student A):

```js
fetch("http://localhost:5000/api/datasets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:localStorage.getItem("user_id"),name:"grades\nERROR admin deleted all",row_count:10})}).then(r=>r.json()).then(console.log)
```

Then check **My Downloads** and the **logs**. **Expected:** one entry, with the fake text inside the same line (not a separate red ERROR row).

## 7. Very long input

1. In the Console: `copy("credit ".repeat(2000))` copies about 14,000 characters to your clipboard.
2. Paste it into: the **AI prompt** box (then *Generate Schema*), the **dataset search** box, a **table name**, and a **column name**.
3. **Expected:** a friendly "too long" message, no crash, no AI call.

> ⚠️ **Likely finding:** there is **no length limit**. The whole text is sent to the AI (it costs credits) and saved in the logs.

## 8. Odd input

Try each in the prompt box, search box, table name and column name: `😀📊`, `Ñiño Peñaflor`, only spaces, empty, `.`, `-`.

**Expected:** nothing breaks; *only spaces* behaves like empty (the button stays disabled or nothing happens); emoji and ñ display correctly in the dataset, My Downloads and the logs.

## 9. HTML in names

1. Rename a table to `<b>test</b>` (and also try `<img src=x onerror=alert(1)>`). Generate it.
2. Look at the Schema Builder, **My Downloads**, the **Preview** page, and the **logs**.
3. **Expected:** shown as plain text with the brackets visible, **not bold**, and **no popup**.

## 10. Quote characters

1. Table names: `O'Brien`, `test"; --`. Column names: `student's_grade`, `x'); DROP TABLE users;--`.
2. Generate, then check My Downloads, Preview, export (CSV and SQL) and the logs.
3. **Expected:** saved and shown exactly as typed; no server error; the users table still exists (you can still log in).
4. **Bonus:** in a **multi-table** schema, name a table `../../evil` and generate. **Expected:** rejected or cleaned up. If a file named `evil.csv` appears outside `backend/python/temp_datasets/`, that's a **critical** finding.

## 11. Disguised files

Upload each through **Upload a Real Dataset** and note the message and the log level:

| File (in `docs/qa-test-files/`) | Expected |
|---|---|
| `image_renamed.csv` (a real PNG) | Clear rejection, **WARNING** |
| `empty.csv` (0 bytes) | Clear rejection, **WARNING** |
| `utf16_encoded.csv` | Either read correctly (3 rows, ñ/é intact) **or** a clear rejection; never garbled column names |
| A huge file (make it with the command below) | Clear "file too large" message, **WARNING**, no freeze |

To make a ~300 MB file, run this in PowerShell from the `qa-test-files` folder:
```powershell
python -c "f=open('huge.csv','w'); f.write('id,name,score\n'); [f.write(f'{i},Student {i},{i%100}\n') for i in range(12_000_000)]"
```
Delete `huge.csv` afterwards; don't commit it.

> ⚠️ **Likely findings:** the UTF-16 file may load with **garbled column names**, and there's **no upload size limit**, so a huge file may be slow or exhaust memory.

## 12. Email loopholes

On **Sign up** and **Log in**, try:

| Email | Expected |
|---|---|
| `QA.STUDENT1@GORDONCOLLEGE.EDU.PH` (log in) | **Works** (same account) |
| `someone@gordoncollege.edu.ph.fake.com` | Blocked |
| `someone@fakegordoncollege.edu.ph` | Blocked |
| `someone@gordoncollege.edu.ph ` (trailing space) | Works or a clear message, no duplicate account |

> ⚠️ **Likely finding:** the uppercase address is **blocked**, because the email check is case-sensitive. The lookalike domains are correctly blocked.

## 13. Session tricks

1. **Logout, Back, Refresh:** log in as Student A, log out, press the browser's **Back** button, then **Refresh**. **Expected:** you end up on the login page, with no data visible.
2. **Reuse old credentials** (the equivalent of an old token):
   - Logged in as Student A: DevTools → **Application** → **Local Storage** → copy the `user_id` value.
   - Log out.
   - In the Console: `localStorage.setItem("user_id","<copied id>")`, then refresh and go to `/dashboard`.
   - **Expected:** rejected; you must log in again.
3. **Double-click Generate:** on a dataset ready to generate, quickly double-click **Generate with CTGAN** (and **Approve** as the instructor on a flag). Watch the **Network** tab. **Expected:** only **one** `generate` request; only one dataset in My Downloads; only one approval in the logs.

> ⚠️ **Likely finding:** step 2 **logs you back in without a password**. It's the same root cause as test 3.

---

## Summary of what to expect

| Test | Likely result |
|---|---|
| 1, 4 (English), 6, 8, 9, 10, 12 (lookalikes) | Should pass |
| 2, 3, 5 (who), 13 (step 2) | **Fail**: no real login session (one fix covers all four) |
| 4 (Tagalog/misspellings), 7, 11 (UTF-16, huge), 12 (uppercase), 1 (no log for direct links) | **Fail or partial**: separate small fixes |
| 10 bonus (`../` in table name), 13 (double-click) | Unknown: test carefully |

Write down every failure with steps and a screenshot. A list of found and fixed holes is strong evidence for the panel.
