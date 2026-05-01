const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const session = require("express-session");
const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const pool = require("./db");
const Anthropic = require("@anthropic-ai/sdk");
// const Groq = require("groq-sdk"); // kept for reference

require("dotenv").config({ path: path.join(__dirname, ".env") });

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const JWT_SECRET   = process.env.JWT_SECRET   || "synthgen-dev-secret";

// ── Mailer ────────────────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const SMTP_READY = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
if (!SMTP_READY) console.log("⚠️  Email verification disabled — SMTP_USER / SMTP_PASS not set in .env");

async function sendVerificationEmail(to, token) {
  const BASE  = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const link  = `${BASE}/verify-email?token=${token}`;
  await mailer.sendMail({
    from:    process.env.SMTP_FROM || "SynthCS <no-reply@synthcs.app>",
    to,
    subject: "Verify your SynthCS account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#6d28d9;margin-bottom:8px">Confirm your email</h2>
        <p style="color:#374151;font-size:15px;line-height:1.6">
          Thanks for signing up for <strong>SynthCS</strong>. Click the button below to verify
          your email address and activate your account.
        </p>
        <a href="${link}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Verify Email Address
        </a>
        <p style="color:#9ca3af;font-size:12px">
          If you didn't create an account, you can safely ignore this email.<br>
          This link expires in 24 hours.
        </p>
      </div>
    `,
  });
}

const app = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// Session — only used during the OAuth handshake (10-minute window)
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 10 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, r.rows[0] || false);
  } catch (err) { done(err); }
});

// ── Database initialisation ───────────────────────────────────────────────────
async function initDB() {
  try {
    // Make password and email nullable so OAuth users don't need them
    await pool.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ALTER COLUMN email   DROP NOT NULL`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name  VARCHAR(255) NOT NULL,
        email      VARCHAR(255) UNIQUE,
        password   VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username           VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin           BOOLEAN DEFAULT FALSE`).catch(() => {});
    // Mark accounts that existed before email verification was introduced as already verified
    await pool.query(`UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE AND verification_token IS NULL`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL,
        provider    VARCHAR(50)  NOT NULL,
        provider_id VARCHAR(255) NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE (provider, provider_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schemas (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL,
        name       VARCHAR(255) NOT NULL,
        table_name VARCHAR(255),
        fields     JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS datasets (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID NOT NULL,
        name              VARCHAR(255) NOT NULL,
        kaggle_ref        VARCHAR(255),
        python_dataset_id VARCHAR(255),
        row_count         INTEGER NOT NULL DEFAULT 0,
        status            VARCHAR(50) DEFAULT 'ready',
        created_at        TIMESTAMP DEFAULT NOW(),
        expires_at        TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
      )
    `);

    console.log("✅ Database connected — all tables ready.");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("   → Check DB_PASSWORD and DB_NAME in backend/.env");
    process.exit(1);
  }
}

// ── OAuth helper ──────────────────────────────────────────────────────────────
async function findOrCreateOAuthUser(provider, providerId, profile) {
  // 1. Already linked?
  const linked = await pool.query(
    `SELECT u.* FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.provider = $1 AND oa.provider_id = $2`,
    [provider, providerId]
  );
  if (linked.rows.length > 0) return linked.rows[0];

  // 2. Email already registered? Link instead of creating duplicate.
  const email = profile.emails?.[0]?.value || null;
  let userId = null;

  if (email) {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) userId = existing.rows[0].id;
  }

  // 3. Brand-new user
  if (!userId) {
    const displayName = profile.displayName || profile.username || "User";
    const newUser = await pool.query(
      "INSERT INTO users (full_name, email) VALUES ($1, $2) RETURNING id",
      [displayName, email]
    );
    userId = newUser.rows[0].id;
  }

  // 4. Link the OAuth account
  await pool.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id)
     VALUES ($1, $2, $3) ON CONFLICT (provider, provider_id) DO NOTHING`,
    [userId, provider, providerId]
  );

  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  return user.rows[0];
}

// ── Passport strategies ───────────────────────────────────────────────────────
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/auth/github/callback",
      scope: ["user:email"],
    },
    async (_at, _rt, profile, done) => {
      try { done(null, await findOrCreateOAuthUser("github", profile.id, profile)); }
      catch (err) { done(err); }
    }
  ));
  console.log("✅ GitHub OAuth ready.");
} else {
  console.log("⚠️  GitHub OAuth disabled — GITHUB_CLIENT_ID not set in .env");
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/auth/google/callback",
    },
    async (_at, _rt, profile, done) => {
      try { done(null, await findOrCreateOAuthUser("google", profile.id, profile)); }
      catch (err) { done(err); }
    }
  ));
  console.log("✅ Google OAuth ready.");
} else {
  console.log("⚠️  Google OAuth disabled — GOOGLE_CLIENT_ID not set in .env");
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function oauthSuccessRedirect(res, user) {
  const params = new URLSearchParams({
    user_id:   user.id,
    user_name: user.full_name,
    is_admin:  user.is_admin ? "true" : "false",
  });
  res.redirect(`${FRONTEND_URL}/auth/callback?${params}`);
}

async function requireAdmin(req, res, next) {
  const adminId = req.query.admin_id || req.body?.admin_id;
  if (!adminId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [adminId]);
    if (!result.rows[0]?.is_admin) return res.status(403).json({ error: "Forbidden" });
    next();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => res.json({ status: "Backend running" }));

// SIGNUP (email + password)
app.post("/signup", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password)
      return res.status(400).json({ error: "full_name, email, and password are required" });

    const hashed = await bcrypt.hash(password, 10);
    const token  = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password, email_verified, verification_token)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, created_at`,
      [full_name, email, hashed, !SMTP_READY, SMTP_READY ? token : null]
    );
    const user = result.rows[0];

    if (SMTP_READY) {
      await sendVerificationEmail(email, token).catch((e) =>
        console.error("Email send failed:", e.message)
      );
      return res.status(201).json({ pending_verification: true, email });
    }

    // SMTP not configured → auto-verify and return session immediately
    res.status(201).json({ id: user.id, full_name: user.full_name, email: user.email });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already exists" });
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// VERIFY EMAIL
app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect(`${FRONTEND_URL}/login?error=invalid_token`);
  try {
    const result = await pool.query(
      `UPDATE users SET email_verified = TRUE, verification_token = NULL
       WHERE verification_token = $1 RETURNING id`,
      [token]
    );
    if (result.rowCount === 0)
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_token`);
    res.redirect(`${FRONTEND_URL}/login?verified=1`);
  } catch (err) {
    console.error("Verify email error:", err.message);
    res.redirect(`${FRONTEND_URL}/login?error=server_error`);
  }
});

// RESEND VERIFICATION
app.post("/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1", [email]
    );
    if (result.rows.length === 0) return res.json({ ok: true }); // don't leak existence
    const user = result.rows[0];
    if (user.email_verified) return res.json({ ok: true });

    const token = crypto.randomUUID();
    await pool.query("UPDATE users SET verification_token = $1 WHERE id = $2", [token, user.id]);
    await sendVerificationEmail(email, token);
    res.json({ ok: true });
  } catch (err) {
    console.error("Resend verification error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN (email + password)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: "Invalid email or password" });

    const user = result.rows[0];
    if (!user.password || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Invalid email or password" });

    if (!user.email_verified)
      return res.status(403).json({ error: "unverified", message: "Please verify your email before logging in." });

    res.json({ id: user.id, full_name: user.full_name, email: user.email, is_admin: user.is_admin || false });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
app.get("/auth/github", (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID)
    return res.redirect(`${FRONTEND_URL}/?oauth_error=GitHub+OAuth+not+configured`);
  passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

app.get("/auth/github/callback",
  passport.authenticate("github", { failureRedirect: `${FRONTEND_URL}/?oauth_error=GitHub+login+failed` }),
  (req, res) => oauthSuccessRedirect(res, req.user)
);

// ── Google OAuth ──────────────────────────────────────────────────────────────
app.get("/auth/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.redirect(`${FRONTEND_URL}/?oauth_error=Google+OAuth+not+configured`);
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}/?oauth_error=Google+login+failed` }),
  (req, res) => oauthSuccessRedirect(res, req.user)
);

// ── User profile ──────────────────────────────────────────────────────────────
app.get("/api/users/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, email, username, created_at FROM users WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { full_name, email, username, new_password, current_password } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (full_name !== undefined) { updates.push(`full_name = $${idx++}`); values.push(full_name); }
    if (email     !== undefined) { updates.push(`email = $${idx++}`);     values.push(email); }
    if (username  !== undefined) { updates.push(`username = $${idx++}`);  values.push(username); }

    if (new_password !== undefined) {
      const user = await pool.query("SELECT password FROM users WHERE id = $1", [req.params.id]);
      if (user.rows[0]?.password) {
        const match = await bcrypt.compare(current_password || "", user.rows[0].password);
        if (!match) return res.status(401).json({ error: "Current password is incorrect" });
      }
      updates.push(`password = $${idx++}`);
      values.push(await bcrypt.hash(new_password, 10));
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, full_name, email, username, created_at`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already in use" });
    console.error("Update user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Schema endpoints ──────────────────────────────────────────────────────────
app.post("/api/schemas", async (req, res) => {
  try {
    const { user_id, name, table_name, fields } = req.body;
    if (!user_id || !name || !fields)
      return res.status(400).json({ error: "user_id, name, and fields are required" });

    const result = await pool.query(
      "INSERT INTO schemas (user_id, name, table_name, fields) VALUES ($1, $2, $3, $4) RETURNING *",
      [user_id, name, table_name || name, JSON.stringify(fields)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Save schema error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/schemas/:userId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM schemas WHERE user_id = $1 ORDER BY created_at DESC",
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get schemas error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/schema/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM schemas WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Schema not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get schema error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/schemas/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM schemas WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete schema error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin routes ─────────────────────────────────────────────────────────────

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [users, verified, schemas, datasets, rows] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users"),
      pool.query("SELECT COUNT(*) FROM users WHERE email_verified = TRUE"),
      pool.query("SELECT COUNT(*) FROM schemas"),
      pool.query("SELECT COUNT(*) FROM datasets"),
      pool.query("SELECT COALESCE(SUM(row_count), 0) AS total FROM datasets"),
    ]);
    res.json({
      total_users:    parseInt(users.rows[0].count),
      verified_users: parseInt(verified.rows[0].count),
      total_schemas:  parseInt(schemas.rows[0].count),
      total_datasets: parseInt(datasets.rows[0].count),
      total_rows:     parseInt(rows.rows[0].total),
    });
  } catch (err) {
    console.error("Admin stats error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  try {
    const [growth, topUsers, recentSignups, recentSchemas, genMode] = await Promise.all([
      // User registrations per month — always return all 6 months (0 if none)
      pool.query(`
        SELECT TO_CHAR(m.month, 'Mon YYYY') AS month,
               COALESCE(COUNT(u.id), 0)::int AS count
        FROM (
          SELECT generate_series(
            date_trunc('month', NOW() - INTERVAL '5 months'),
            date_trunc('month', NOW()),
            '1 month'::interval
          ) AS month
        ) m
        LEFT JOIN users u
          ON date_trunc('month', u.created_at) = m.month
        GROUP BY m.month
        ORDER BY m.month
      `),
      // Top 5 users by schema + dataset activity
      pool.query(`
        SELECT u.id, u.full_name, u.email,
               COUNT(DISTINCT s.id)::int                    AS schema_count,
               COUNT(DISTINCT d.id)::int                    AS dataset_count,
               COALESCE(SUM(d.row_count), 0)::int           AS total_rows
        FROM users u
        LEFT JOIN schemas  s ON s.user_id = u.id
        LEFT JOIN datasets d ON d.user_id = u.id
        GROUP BY u.id
        ORDER BY (COUNT(DISTINCT s.id) + COUNT(DISTINCT d.id)) DESC
        LIMIT 5
      `),
      // 5 most recent signups
      pool.query(`
        SELECT full_name, email, created_at
        FROM users ORDER BY created_at DESC LIMIT 5
      `),
      // 5 most recent schemas with owner name
      pool.query(`
        SELECT s.name, s.table_name, s.created_at, u.full_name AS user_name
        FROM schemas s
        JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC LIMIT 5
      `),
      // Kaggle vs Schema (LLM) dataset split
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE kaggle_ref IS NOT NULL)::int AS kaggle,
          COUNT(*) FILTER (WHERE kaggle_ref IS NULL)::int     AS schema
        FROM datasets
      `),
    ]);

    res.json({
      user_growth:    growth.rows,
      top_users:      topUsers.rows,
      recent_signups: recentSignups.rows,
      recent_schemas: recentSchemas.rows,
      gen_mode:       genMode.rows[0] ?? { kaggle: 0, schema: 0 },
    });
  } catch (err) {
    console.error("Admin analytics error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.username, u.email_verified, u.is_admin, u.created_at,
             COUNT(s.id)::int AS schema_count
      FROM users u
      LEFT JOIN schemas s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Admin list users error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/users/:id/verify", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Admin verify user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/users/:id/toggle-admin", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_admin = NOT is_admin WHERE id = $1 RETURNING is_admin",
      [req.params.id]
    );
    res.json({ is_admin: result.rows[0].is_admin });
  } catch (err) {
    console.error("Admin toggle admin error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── LLM Schema Generation ─────────────────────────────────────────────────────

const VALID_TYPES = ["string","integer","float","boolean","date","email","uuid","phone","address","name","ip"];

app.post("/api/llm/generate-schema", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured." });

  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });

  const schemaPrompt = `You are a data schema designer. Given a description, return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Return this exact shape:
{
  "table_name": "snake_case_name",
  "fields": [
    {
      "name": "field_name",
      "type": "one_of_valid_types",
      "nullable": false,
      "null_rate": 0,
      "constraints": {
        "min_val": 0,
        "max_val": 100,
        "distribution": "uniform",
        "enum_values": "val1, val2, val3",
        "cardinality": 50,
        "true_ratio": 0.5,
        "date_from": "2020-01-01",
        "date_to": "2024-12-31"
      },
      "description": "what this field represents"
    }
  ]
}

Rules:
- Valid types: ${VALID_TYPES.join(", ")}
- Include 5-12 realistic fields
- For each field include ONLY the constraints relevant to its type:
  - integer/float: min_val, max_val, distribution (uniform|normal|skewed)
  - string (categories): enum_values as a comma-separated string like "Low, Medium, High"
  - string (free text): cardinality (number of unique values)
  - boolean: true_ratio (0.0 to 1.0)
  - date: date_from and date_to in YYYY-MM-DD format
- enum_values must always be a plain string, never an array
- Always include a description for each field

Description: ${prompt.trim()}`;

  try {
    // ── Anthropic / Claude Haiku ──────────────────────────────────────────────
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: schemaPrompt }],
    });
    let raw = message.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // ── Groq / Llama 3.3 70B (swap back by uncommenting) ─────────────────────
    // const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    // const completion = await groq.chat.completions.create({
    //   model: "llama-3.3-70b-versatile",
    //   max_tokens: 2048,
    //   messages: [{ role: "user", content: schemaPrompt }],
    // });
    // let raw = completion.choices[0].message.content.trim();
    // raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const schema = JSON.parse(raw);
    if (!schema.table_name || !Array.isArray(schema.fields)) throw new Error("Invalid schema shape");

    schema.fields = schema.fields.map((f) => {
      const c = f.constraints ?? {};
      // Ensure enum_values is always a plain string (never an array)
      if (Array.isArray(c.enum_values)) c.enum_values = c.enum_values.join(", ");
      return {
        name:        f.name,
        type:        VALID_TYPES.includes(f.type) ? f.type : "string",
        nullable:    Boolean(f.nullable),
        null_rate:   typeof f.null_rate === "number" ? f.null_rate : 0,
        constraints: c,
        description: f.description ?? "",
      };
    });

    res.json(schema);
  } catch (err) {
    console.error("LLM schema error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/llm/suggest-field", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured." });

  const { field_name, description } = req.body;
  if (!field_name?.trim()) return res.status(400).json({ error: "field_name is required" });

  const fieldPrompt = `You are a data schema designer. Given a field name and optional description, return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Return this exact shape:
{
  "type": "one_of_valid_types",
  "description": "what this field represents",
  "constraints": {}
}

Valid types: ${VALID_TYPES.join(", ")}
For each type include ONLY relevant constraints:
- integer/float: min_val, max_val, distribution (uniform|normal|skewed)
- string (categories): enum_values as comma-separated string like "Low, Medium, High"
- string (free text): cardinality (number of unique values)
- boolean: true_ratio (0.0 to 1.0)
- date: date_from and date_to in YYYY-MM-DD format
- ip: no constraints needed
- email/uuid/phone/address/name: no constraints needed

Field name: ${field_name.trim()}
Description: ${description?.trim() || "(none)"}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: fieldPrompt }],
    });
    let raw = message.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const suggestion = JSON.parse(raw);
    if (Array.isArray(suggestion.constraints?.enum_values))
      suggestion.constraints.enum_values = suggestion.constraints.enum_values.join(", ");
    suggestion.type = VALID_TYPES.includes(suggestion.type) ? suggestion.type : "string";
    res.json(suggestion);
  } catch (err) {
    console.error("LLM suggest-field error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Dataset endpoints ─────────────────────────────────────────────────────────
const PYTHON_DATASETS_DIR = path.join(__dirname, "python", "temp_datasets");

app.post("/api/datasets", async (req, res) => {
  try {
    const { user_id, name, kaggle_ref, python_dataset_id, row_count } = req.body;
    if (!user_id || !name)
      return res.status(400).json({ error: "user_id and name are required" });

    const result = await pool.query(
      `INSERT INTO datasets (user_id, name, kaggle_ref, python_dataset_id, row_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, name, kaggle_ref || null, python_dataset_id || null, row_count || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Register dataset error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/datasets/:userId", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM datasets
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get datasets error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/datasets/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM datasets WHERE id = $1 RETURNING python_dataset_id",
      [req.params.id]
    );
    if (result.rowCount > 0 && result.rows[0].python_dataset_id) {
      const dir = path.join(PYTHON_DATASETS_DIR, result.rows[0].python_dataset_id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete dataset error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Expired dataset cleanup ───────────────────────────────────────────────────
async function cleanupExpiredDatasets() {
  try {
    const expired = await pool.query(
      "SELECT id, python_dataset_id FROM datasets WHERE expires_at < NOW()"
    );
    if (expired.rowCount === 0) return;

    for (const row of expired.rows) {
      if (row.python_dataset_id) {
        const dir = path.join(PYTHON_DATASETS_DIR, row.python_dataset_id);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    await pool.query("DELETE FROM datasets WHERE expires_at < NOW()");
    console.log(`🗑️  Cleaned up ${expired.rowCount} expired dataset(s).`);
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

initDB().then(() => {
  cleanupExpiredDatasets();
  setInterval(cleanupExpiredDatasets, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
