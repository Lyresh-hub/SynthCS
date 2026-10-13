// =============================================================================
// create-admin.js — creates (or resets) ONE administrator account, ready to use
// =============================================================================
// The account is written straight to the database: email already verified,
// approved, admin rights on, walkthrough marked done. Nothing else is touched.
//
// Usage (from the backend folder):
//   node scripts/create-admin.js                                  → local database
//   DATABASE_URL=<railway public url> node scripts/create-admin.js → live database
//
// Options:
//   --email you@gordoncollege.edu.ph   (default: qa.techadmin@gordoncollege.edu.ph)
//   --name  "First Last"               (default: "Tech Admin")
//   --password <pw>                    (default: a random strong password, printed once)
//
// If the email already exists, that account is made an admin, verified, and its
// password is reset to the new one.
// =============================================================================

const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const bcrypt = require("bcrypt");
const pool = require("../db");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const email = arg("email", "qa.techadmin@gordoncollege.edu.ph").trim().toLowerCase();
  const name = arg("name", "Tech Admin").trim();
  const password = arg("password", `Adm-${crypto.randomBytes(6).toString("base64url")}!9`);

  if (!email.endsWith("@gordoncollege.edu.ph")) throw new Error("The email must end with @gordoncollege.edu.ph (the login only accepts Gordon College emails).");
  if (password.length < 8) throw new Error("The password must be at least 8 characters.");
  const [first, ...rest] = name.split(/\s+/);
  const last = rest.join(" ") || "Admin";

  const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : (process.env.DB_HOST || "localhost");
  console.log(`Database: ${target}`);

  const hashed = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO users (first_name, last_name, full_name, email, password, email_verified,
                        is_admin, is_instructor, approval_status, strike_count, is_banned, ban_reason,
                        tour_done, verification_token, verification_token_expires)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, FALSE, 'approved', 0, FALSE, NULL, TRUE, NULL, NULL)
     ON CONFLICT (email) DO UPDATE SET
       password = EXCLUDED.password, email_verified = TRUE, is_admin = TRUE,
       approval_status = 'approved', is_banned = FALSE, ban_reason = NULL,
       verification_token = NULL, verification_token_expires = NULL, reset_token = NULL
     RETURNING id, (xmax <> 0) AS existed`,
    [first, last, `${first} ${last}`, email, hashed]
  );
  // End any old sessions of this account (if it existed) so only the new password works
  await pool.query("UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1", [r.rows[0].id]).catch(() => {});

  console.log(`\n${r.rows[0].existed ? "Existing account updated" : "Admin account created"} — ready to use:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     Administrator (email already verified)`);
  console.log("\nSign in at https://synthcs.site → Sign in. Share the password privately.");
}

main()
  .catch((e) => { console.error("Could not create the admin account:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
