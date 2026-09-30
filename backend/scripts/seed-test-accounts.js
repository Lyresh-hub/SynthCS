// =============================================================================
// seed-test-accounts.js — creates / resets the QA test accounts
// =============================================================================
// Usage (from the backend folder):
//   node scripts/seed-test-accounts.js                  → local database (backend/.env)
//   DATABASE_URL=<railway url> node scripts/seed-test-accounts.js   → production
//
// Options:
//   QA_PASSWORD=<pw>   use this password for every account (otherwise a random
//                      one is generated and printed once — save it privately)
//   --wipe-activity    also delete the QA accounts' flags, datasets, and logs,
//                      for a clean test round
//
// Safe to re-run: it resets passwords, strikes, bans, approval state, and class
// memberships of the QA accounts only. No other user is touched.
// =============================================================================

const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const bcrypt = require("bcrypt");
const pool = require("../db");

const DOMAIN = "@gordoncollege.edu.ph"; // the only domain the login accepts
const CLASS_A = "QA Class A";
const CLASS_B = "QA Class B";

const ACCOUNTS = [
  { key: "admin",       first: "QA", last: "Admin",       role: "admin",      purpose: "Sees every log and all system events" },
  { key: "instructor1", first: "QA", last: "Instructor One", role: "instructor", purpose: `Owns ${CLASS_A}: reviews flags, sets restrictions` },
  { key: "instructor2", first: "QA", last: "Instructor Two", role: "instructor", purpose: `Owns ${CLASS_B}: checks instructors only see their own students` },
  { key: "student1",    first: "QA", last: "Student One",  role: "student", classes: ["instructor1"],                purpose: `Normal student in ${CLASS_A}` },
  { key: "student2",    first: "QA", last: "Student Two",  role: "student", classes: ["instructor1", "instructor2"], purpose: `Multi-class: ${CLASS_A} + ${CLASS_B}` },
  { key: "student3",    first: "QA", last: "Student Three", role: "student", classes: ["instructor1"],               purpose: "Rejections / strikes (banned at 3)" },
  { key: "student4",    first: "QA", last: "Student Four", role: "student", classes: ["instructor1"], unverified: true, purpose: "Email NOT verified — login should fail with a warning" },
];

const emailOf = (key) => `qa.${key}${DOMAIN}`;

async function main() {
  const wipe = process.argv.includes("--wipe-activity");
  const password = process.env.QA_PASSWORD || `Qa-${crypto.randomBytes(6).toString("base64url")}!`;
  const hashed = await bcrypt.hash(password, 10);
  const ids = {};

  const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : (process.env.PGHOST || process.env.DB_HOST || "localhost");
  console.log(`Seeding QA accounts into database at: ${target}\n`);

  // Instructors/admin first so students can be linked to them
  for (const a of [...ACCOUNTS].sort((x, y) => (x.role === "student") - (y.role === "student"))) {
    const fullName = `${a.first} ${a.last}`;
    const firstClass = a.classes?.[0];
    const instructorName = firstClass ? ACCOUNTS.find((x) => x.key === firstClass) : null;
    const r = await pool.query(
      `INSERT INTO users (first_name, last_name, full_name, email, password, email_verified,
                          is_admin, is_instructor, approval_status, strike_count, is_banned, ban_reason,
                          course, instructor, tour_done, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', 0, FALSE, NULL, $9, $10, TRUE, $11, $12)
       ON CONFLICT (email) DO UPDATE SET
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, full_name = EXCLUDED.full_name,
         password = EXCLUDED.password, email_verified = EXCLUDED.email_verified,
         is_admin = EXCLUDED.is_admin, is_instructor = EXCLUDED.is_instructor, approval_status = 'approved',
         strike_count = 0, is_banned = FALSE, ban_reason = NULL,
         course = EXCLUDED.course, instructor = EXCLUDED.instructor,
         verification_token = EXCLUDED.verification_token,
         verification_token_expires = EXCLUDED.verification_token_expires, reset_token = NULL
       RETURNING id`,
      [
        a.first, a.last, fullName, emailOf(a.key), hashed, !a.unverified,
        a.role === "admin", a.role === "instructor",
        firstClass ? (firstClass === "instructor1" ? CLASS_A : CLASS_B) : null,
        instructorName ? `${instructorName.first} ${instructorName.last}` : null,
        // A pending token keeps the account unverified — the server auto-verifies
        // token-less accounts on startup (legacy migration)
        a.unverified ? crypto.randomUUID() : null,
        a.unverified ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
      ]
    );
    ids[a.key] = r.rows[0].id;
  }

  // Class memberships (multi-class enrollment table)
  const studentIds = ACCOUNTS.filter((a) => a.role === "student").map((a) => ids[a.key]);
  await pool.query("DELETE FROM student_classes WHERE student_id = ANY($1)", [studentIds]);
  for (const a of ACCOUNTS.filter((x) => x.classes)) {
    for (const ins of a.classes) {
      await pool.query(
        `INSERT INTO student_classes (student_id, instructor_id, course, status) VALUES ($1, $2, $3, 'approved')
         ON CONFLICT (student_id, instructor_id, course) DO UPDATE SET status = 'approved'`,
        [ids[a.key], ids[ins], ins === "instructor1" ? CLASS_A : CLASS_B]
      );
    }
  }

  if (wipe) {
    const all = Object.values(ids);
    await pool.query("DELETE FROM flagged_prompts WHERE student_id = ANY($1)", [all]).catch(() => {});
    await pool.query("DELETE FROM datasets WHERE user_id = ANY($1)", [all]).catch(() => {});
    await pool.query("DELETE FROM activity_log WHERE user_id = ANY($1)", [all]).catch(() => {});
    await pool.query("DELETE FROM instructor_restrictions WHERE instructor_id = ANY($1)", [[ids.instructor1, ids.instructor2]]).catch(() => {});
    console.log("Wiped QA accounts' flags, datasets, logs, and class restrictions.\n");
  }

  console.log("Account                              Role         Purpose");
  console.log("-".repeat(100));
  for (const a of ACCOUNTS) console.log(`${emailOf(a.key).padEnd(37)}${a.role.padEnd(13)}${a.purpose}`);
  console.log(`\nPassword for all QA accounts: ${password}`);
  console.log("Save it in the team's private notes — it is not stored anywhere else.\n");
  console.log("Note: these addresses don't have real inboxes, so approval/rejection emails won't arrive.");
  console.log("To test emails, use a real student account for that one step.");
}

main()
  .catch((e) => { console.error("Seeding failed:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
