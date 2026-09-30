# How SynthCS Decides to Flag a Prompt

This document answers the question **"What exactly triggers the flag?"** It explains how the prompt, the dataset, trigger words, instructor restrictions, AI detection and the flagging and approval system relate to each other.

## 1. What gets checked

| Input | What it is | Checked by |
|---|---|---|
| **Prompt** | The student's own words, **exactly as typed**: the dataset search query or the AI schema description | Level 1, Level 2 and Level 3 |
| **Dataset** | The column names of the dataset the student is about to generate (from a search result, an upload, or the AI schema) | Level 1 (the instructor's trigger words), at generation time |

The prompt is always the primary input. The system never relies only on the dataset or on a list of dataset names. If a restricted word appears in the prompt, it is detected even when the dataset looks harmless.

## 2. The three detection levels

All three levels run on every prompt. One level passing does not stop the others. The flag records which level fired and on which word.

| Level | Name | How it works | Can be changed by | Result |
|---|---|---|---|---|
| **Level 1** | Instructor trigger words (**restrictions**) | Words the instructor adds in *Instructor Panel → Restrictions*, each set to **Flag** or **Block** | The instructor, per class | **Flag** → sent to the instructor for review · **Block** → prompt refused |
| **Level 2** | AI detection | Claude Haiku reads the prompt for **intent**. It catches harmful requests that use none of the listed words (e.g. "records showing which professors can be pressured"). | — | Flag |
| **Level 3** | System-level trigger words | Built-in rules in `backend/moderation.js`, always on (financial data, fraud, corruption, manipulation and falsification, cyber attacks, theft and privacy, illegal activity, harmful intent) | Nobody (read-only) | Flag |

**AI and rules together.**

- The rules (Levels 1 and 3) are deterministic and always run. The AI (Level 2) can **add** a flag but can **never remove** a flag raised by a rule.
- **Fallback:** if the AI is down, times out, runs out of quota, or simply misses a word, Levels 1 and 3 still decide. In that case the flag reason says: *"AI detection unavailable — flagged by rule-based fallback"*.

## 3. How word variations are caught

Before the rules run, the prompt is **normalised**. This means the rules also match variations of each word, not only the exact word:

| Variation | Example typed | Caught as |
|---|---|---|
| Capital letters | `MANIPULATE`, `Corrupt` | manipulate, corrupt |
| Other word forms | manipulat**ing**, manipulat**ion**, corrupt**ed**, corrupt**ion** | manipulate, corrupt |
| Separators or no space | `credit-card`, `credit_card`, `creditcard` | credit card |
| Spaced-out letters | `c r e d i t card`, `m.a.n.i.p.u.l.a.t.e` | credit card, manipulate |
| Look-alike characters | `ph1shing`, `fr@ud`, `cr3dit`, `h4ck` | phishing, fraud, credit, hack |
| Accents | `frâud` | fraud |
| Misspelling of phishing | `fishing emails`, `fishing links` | phishing |
| Inside a longer phrase | "stock price **manipulation** dataset" | manipulate |

**Special case: "fishing".** "Fishing" is flagged as a likely misspelling of *phishing*. The only exception is a prompt that is clearly about real fishing, for example "fishing boat catch by species". That exception is cancelled as soon as the prompt also mentions emails, links, passwords, accounts, or similar words.

Instructor (Level 1) words get the same treatment. For example, adding *gambling* also catches *gamble* and *GAMBLING*, and adding *exam answers* also catches *exam-answers*.

## 4. From flag to dataset: the review transaction

```
Student prompt ──► Level 1 + Level 2 + Level 3
                        │
          ┌─────────────┼───────────────────────────┐
     nothing fired   Block (Level 1)            Flag (any level)
          │             │                           │
     proceeds       refused                 PENDING review opened
     normally                               (flag reason + matched words saved)
                                                    │
                                   student may keep building, but every
                                   dataset from this prompt is LOCKED:
                                   no preview, export, or download
                                                    │
                                     ┌──────────────┴──────────────┐
                                 APPROVED                       REJECTED
                        datasets unlock; the same         datasets stay locked and are
                        prompt is not flagged again       deleted; the same prompt is
                                                          refused; the student gets a strike
```

The dataset is tied to the review, so access is only granted **after** approval. The system never allows the action first and checks afterwards.

## 5. What the instructor sees

- **Flagged tab:** for each flag, which level fired, the exact word or rule, and the text it matched (e.g. `"manipulate" ← matched "manipulating"`), plus the AI verdict.
- **Restrictions tab:**
  - A **Test a prompt** tool that runs all three levels on any text and shows the result. Nothing is saved.
  - The live Level 3 list. Hovering over a word shows the variations it catches. This is the same list the detector uses, not a separate copy.
- **Activity and Prompt History tabs:** trigger words are highlighted using the same detector.

## 6. Testing

`node backend/moderation.test.js --report` tests **every** Level 3 trigger word individually:

- Each word is tested with **each** of its listed variations.
- Every variation is tested three ways: alone, inside a realistic prompt, and in uppercase.
- The run also covers:
  - The reviewer's examples (corrupt, manipulate, fishing, credit card) in several phrasings.
  - Level 1 flag and block words, including matches in dataset column names.
  - The AI-down fallback.
  - A set of ordinary prompts that must **not** be flagged.

The full results are in [`flagging-test-report.md`](flagging-test-report.md).

## 7. Known trade-off

Because any restricted word in the prompt is detected, some legitimate academic prompts are flagged for review. Examples are "fraud detection dataset" and "data manipulation practice in pandas". A flag only sends the prompt for review; it does not block it. The instructor can approve it with one click, and an approved prompt is not flagged again.
