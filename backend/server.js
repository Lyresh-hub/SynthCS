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
// Gmail API (sends via HTTPS — no SMTP ports needed)
const pool = require("./db");
const Anthropic = require("@anthropic-ai/sdk");
const moderation = require("./moderation");
const { AsyncLocalStorage } = require("async_hooks");
const { createLogger, CLIENT_ACTIONS, describe: describeLog } = require("./logger");
// const Groq = require("groq-sdk"); // kept for reference

require("dotenv").config({ path: path.join(__dirname, ".env") });

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const JWT_SECRET   = process.env.JWT_SECRET   || "synthgen-dev-secret";

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith("http://localhost")) return true;
  if (origin.endsWith(".vercel.app")) return true;
  if (origin === FRONTEND_URL) return true;
  if (origin === "https://synthcs.site") return true;
  if (origin === "https://www.synthcs.site") return true;
  return false;
}

// ── Email (Gmail API over HTTPS — no SMTP ports needed) ──────────────────────
const EMAIL_READY = !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
if (!EMAIL_READY) console.log("⚠️  Email verification disabled — Gmail API credentials not set");

async function getGmailAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Gmail access token: " + JSON.stringify(data));
  return data.access_token;
}

async function sendVerificationEmail(to, token) {
  const BASE   = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  const link   = `${BASE}/verify-email?token=${token}`;
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";

  const htmlBody = `
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
    </div>`;

  const rawEmail = [
    `From: SynthCS <${sender}>`,
    `To: ${to}`,
    `Subject: Verify your SynthCS account`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const accessToken = await getGmailAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
}

async function sendPasswordResetEmail(to, code) {
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#6d28d9;margin-bottom:8px">Reset your password</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        We received a request to reset your <strong>SynthCS</strong> password.
        Enter the code below on the sign-in page to set a new password.
      </p>
      <div style="margin:24px 0;text-align:center">
        <span style="display:inline-block;padding:16px 32px;background:#f3f0ff;border:2px solid #7c3aed;
                     border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#6d28d9">
          ${code}
        </span>
      </div>
      <p style="color:#9ca3af;font-size:12px">
        This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
      </p>
    </div>`;

  const rawEmail = [
    `From: SynthCS <${sender}>`,
    `To: ${to}`,
    `Subject: Reset your SynthCS password`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const accessToken = await getGmailAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
}

async function sendClassInvitationEmail(to, instructorName, course, token) {
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const link   = `${process.env.FRONTEND_URL || "https://synthcs.site"}/accept-invitation?token=${token}`;

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#6d28d9;margin-bottom:8px">You've been invited to join a class</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        <strong>${instructorName}</strong> has invited you to join their
        <strong>${course || "class"}</strong> on <strong>SynthCS</strong>.
      </p>
      <a href="${link}"
         style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Accept Invitation
      </a>
      <p style="color:#9ca3af;font-size:12px">
        If you don't have a SynthCS account yet, you'll be asked to sign up first.<br>
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>`;

  const rawEmail = [
    `From: SynthCS <${sender}>`,
    `To: ${to}`,
    `Subject: ${instructorName} invited you to a SynthCS class`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const accessToken = await getGmailAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
}

async function sendDeletionWarningEmail(to, fullName, deletionDate, reason) {
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const dateStr = new Date(deletionDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#dc2626;margin-bottom:8px">Account Deletion Notice</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Hi <strong>${fullName}</strong>,
      </p>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Your <strong>SynthCS</strong> account has been scheduled for permanent deletion on
        <strong>${dateStr}</strong>.
      </p>
      ${reason ? `<p style="color:#374151;font-size:14px;background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:16px 0"><strong>Reason:</strong> ${reason}</p>` : ""}
      <p style="color:#374151;font-size:15px;line-height:1.6">
        You have until <strong>${dateStr}</strong> to log in and download or save any schemas
        and datasets you wish to keep. After this date, all your data will be permanently removed
        and cannot be recovered.
      </p>
      <p style="color:#6b7280;font-size:13px;margin-top:24px">
        If you believe this is a mistake, please contact the administrator immediately.
      </p>
    </div>`;

  const rawEmail = [
    `From: SynthCS <${sender}>`,
    `To: ${to}`,
    `Subject: Important: Your SynthCS account is scheduled for deletion`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const accessToken = await getGmailAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
}

async function sendApprovalEmail(to, fullName) {
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#6d28d9;margin-bottom:8px">Your account has been approved!</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Hi <strong>${fullName}</strong>,
      </p>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Great news! Your instructor has approved your <strong>SynthCS</strong> account.
        You can now sign in and start generating synthetic datasets.
      </p>
      <a href="${frontendUrl}/login"
         style="display:inline-block;margin:24px 0;padding:12px 28px;background:#7c3aed;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Sign in to SynthCS
      </a>
      <p style="color:#9ca3af;font-size:12px">
        If you did not sign up for SynthCS, you can safely ignore this email.
      </p>
    </div>`;

  const rawEmail = [
    `From: SynthCS <${sender}>`,
    `To: ${to}`,
    `Subject: Your SynthCS account has been approved`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const accessToken = await getGmailAccessToken();
  const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!gmailRes.ok) {
    const body = await gmailRes.text();
    throw new Error(`Gmail API error ${gmailRes.status}: ${body}`);
  }
}

async function sendFlaggedPromptEmail(to, instructorName, studentName, promptText) {
  if (!EMAIL_READY) return;
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#d97706;margin-bottom:8px">Flagged Prompt Needs Review</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Hi <strong>${instructorName}</strong>, a prompt from one of your students has been flagged for review.
      </p>
      <p style="color:#374151;font-size:14px"><strong>Student:</strong> ${studentName}</p>
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#92400e">
        ${promptText}
      </div>
      <a href="${frontendUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 28px;background:#7c3aed;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Review in Instructor Dashboard
      </a>
    </div>`;
  const rawEmail = [
    `From: SynthCS <${sender}>`, `To: ${to}`,
    `Subject: [SynthCS] Flagged prompt from ${studentName} needs your review`,
    `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, ``, htmlBody,
  ].join("\r\n");
  const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const accessToken = await getGmailAccessToken();
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
}

async function sendPromptApprovedEmail(to, studentName, promptText, instructorName) {
  if (!EMAIL_READY) return;
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const approvedBy = instructorName || "your instructor";
  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#059669;margin-bottom:8px">Your prompt has been approved!</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Hi <strong>${studentName}</strong>, <strong>${approvedBy}</strong> has approved your flagged prompt.
        Any dataset you generated from it is now unlocked — you can preview and download it from My Downloads in SynthCS.
      </p>
      <div style="background:#d1fae5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#065f46">
        ${promptText}
      </div>
      <p style="color:#9ca3af;font-size:12px">Sign in and paste the same prompt to proceed.</p>
    </div>`;
  // Encode subject using RFC 2047 to safely handle any non-ASCII characters
  const subjectText = `[SynthCS] Your prompt has been approved by ${approvedBy}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText).toString("base64")}?=`;
  const rawEmail = [
    `From: SynthCS <${sender}>`, `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, ``, htmlBody,
  ].join("\r\n");
  const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const accessToken = await getGmailAccessToken();
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
}

async function sendPromptRejectedEmail(to, studentName, promptText, instructorName, strikeCount) {
  if (!EMAIL_READY) return;
  const sender = process.env.GMAIL_SENDER || "christianboluntate5@gmail.com";
  const rejectedBy = instructorName || "your instructor";
  const strikeWarning = strikeCount >= 3
    ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin:12px 0;font-size:13px;color:#991b1b">
        Your account has been <strong>suspended</strong> due to repeated violations.
       </div>`
    : `<p style="color:#6b7280;font-size:13px;margin-top:12px">
        This is strike <strong>${strikeCount}</strong> of 3. Reaching 3 strikes will result in account suspension.
       </p>`;
  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#dc2626;margin-bottom:8px">Your prompt has been rejected</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6">
        Hi <strong>${studentName}</strong>, <strong>${rejectedBy}</strong> has reviewed and rejected your flagged prompt.
        Please revise your request to follow the academic use guidelines.
      </p>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#7f1d1d">
        ${promptText}
      </div>
      ${strikeWarning}
      <p style="color:#9ca3af;font-size:12px">If you believe this is an error, please contact your instructor directly.</p>
    </div>`;
  const subjectText = `[SynthCS] Your prompt has been rejected by ${rejectedBy}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText).toString("base64")}?=`;
  const rawEmail = [
    `From: SynthCS <${sender}>`, `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, ``, htmlBody,
  ].join("\r\n");
  const encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const accessToken = await getGmailAccessToken();
  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
}

const { logEvent } = createLogger(pool);

// Existing call sites keep using logActivity(userId, action, details);
// level, category and message are filled in from the catalog in logger.js
async function logActivity(userId, actionType, details = {}) {
  await logEvent({ action: actionType, userId, details });
}

// Email failures are WARN: the action itself succeeded, only the notification didn't
function reportEmailFailure(emailType, err, userId = null) {
  logEvent({ action: "email_failed", userId, details: { email_type: emailType, error: err?.message ?? String(err) } });
}

const app = express();
app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(express.json());

// ── Request logging (CloudWatch-style) ────────────────────────────────────────
// Every request runs inside a small context. console.error() calls made while
// handling it are remembered, so when the request ends with a 5xx we can log an
// ERROR with the route, status, duration, user, and the actual error message.
// Requests slower than SLOW_REQUEST_MS are logged as WARN.
const requestContext = new AsyncLocalStorage();
const SLOW_REQUEST_MS = 20_000;
const _consoleError = console.error.bind(console);
console.error = (...args) => {
  const ctx = requestContext.getStore();
  const first = String(args[0] ?? "");
  if (ctx && !first.startsWith("[log]")) {
    ctx.lastError = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 300);
  }
  _consoleError(...args);
};

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  const ctx = { start: Date.now() };
  res.on("finish", () => {
    const duration_ms = Date.now() - ctx.start;
    const route = (req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path).slice(0, 120);
    if (route === "/api/activity/log") return;
    const candidate = req.body?.user_id || req.body?.student_id || req.query?.user_id || req.query?.instructor_id || req.body?.instructor_id || null;
    const userId = typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null;
    if (res.statusCode >= 500) {
      logEvent({ action: "http_error", userId, details: { method: req.method, route, status: res.statusCode, duration_ms, error: ctx.lastError ?? null } });
    } else if (duration_ms > SLOW_REQUEST_MS && !route.startsWith("/api/llm/")) {
      logEvent({ action: "slow_request", userId, details: { method: req.method, route, status: res.statusCode, duration_ms } });
    }
  });
  requestContext.run(ctx, next);
});

process.on("unhandledRejection", (reason) => {
  logEvent({ action: "unhandled_error", details: { kind: "promise rejection", error: reason?.message ?? String(reason) } });
});
process.on("uncaughtException", (err) => {
  logEvent({ action: "unhandled_error", details: { kind: "exception", error: err?.message ?? String(err), stack: String(err?.stack ?? "").slice(0, 1500) } })
    .finally(() => setTimeout(() => process.exit(1), 500));
});

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
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token                  VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires          TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires   TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name    VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name     VARCHAR(100) NOT NULL DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count  INT DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned     BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason    TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_deletion       BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_reason       TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS course          VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor      VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status  VARCHAR(20)  DEFAULT 'pending'`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_instructor    BOOLEAN      DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS semester         VARCHAR(50)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_done        BOOLEAN DEFAULT FALSE`).catch(() => {});
    // Mark all pre-existing users as having seen the tour so it doesn't repeat for them
    await pool.query(`UPDATE users SET tour_done = TRUE WHERE tour_done = FALSE AND created_at < NOW() - INTERVAL '5 minutes'`).catch(() => {});
    // Existing accounts before approval feature get auto-approved so they aren't locked out
    await pool.query(`UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL`).catch(() => {});

    // Instructors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructors (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `).catch(() => {});
    // Restriction columns on instructors table (kept for backward compat)
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS max_rows INTEGER DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS allowed_formats TEXT[] DEFAULT NULL`).catch(() => {});

    // Per-course restrictions (replaces instructor-level columns)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructor_course_restrictions (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instructor_id  UUID NOT NULL,
        course         VARCHAR(100) NOT NULL,
        max_rows       INTEGER DEFAULT NULL,
        allowed_formats TEXT[] DEFAULT NULL,
        updated_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(instructor_id, course)
      )
    `).catch(() => {});

    // Seed the two instructors with a default password if they don't exist yet
    const instructorSeeds = [
      { name: 'Erlinda Casiela Abarintos', email: 'eabarintos@gordoncollege.edu.ph' },
      { name: 'Arnie Armada',              email: 'aarmada@gordoncollege.edu.ph'    },
    ];
    for (const ins of instructorSeeds) {
      const exists = await pool.query('SELECT id FROM instructors WHERE email = $1', [ins.email]);
      if (exists.rows.length === 0) {
        const hashed = await bcrypt.hash('SynthCS@2025', 10);
        await pool.query(
          'INSERT INTO instructors (name, email, password) VALUES ($1, $2, $3)',
          [ins.name, ins.email, hashed]
        );
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_archive (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               UUID NOT NULL UNIQUE,
        full_name             VARCHAR(255),
        email                 VARCHAR(255),
        username              VARCHAR(255),
        schema_count          INT DEFAULT 0,
        archive_reason        TEXT,
        archived_at           TIMESTAMPTZ DEFAULT NOW(),
        deletion_scheduled_at TIMESTAMPTZ,
        notified_at           TIMESTAMPTZ,
        is_banned             BOOLEAN DEFAULT FALSE
      )
    `).catch(() => {});
    await pool.query(`ALTER TABLE user_archive ADD COLUMN IF NOT EXISTS user_id UUID`).catch(() => {});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_archive_user_id_idx ON user_archive (user_id)`).catch(() => {});
    // Migrate existing full_name data into first_name / last_name
    await pool.query(`
      UPDATE users
      SET first_name = CASE WHEN full_name LIKE '% %' THEN SPLIT_PART(full_name, ' ', 1) ELSE full_name END,
          last_name  = CASE WHEN full_name LIKE '% %' THEN TRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)) ELSE '' END
      WHERE first_name IS NULL AND full_name IS NOT NULL
    `).catch(() => {});
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
    await pool.query(`ALTER TABLE datasets ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'llm'`).catch(() => {});
    // Flagged-prompt review this dataset is locked behind (status: pending_review → ready | rejected)
    await pool.query(`ALTER TABLE datasets ADD COLUMN IF NOT EXISTS review_id UUID`).catch(() => {});

    // Flagged prompts — instructor review queue
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flagged_prompts (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id   UUID NOT NULL,
        instructor_id UUID,
        prompt_text  TEXT NOT NULL,
        flag_reason  TEXT,
        status       VARCHAR(20) DEFAULT 'pending',
        reviewed_at  TIMESTAMPTZ,
        reviewed_by  UUID,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
    // Exactly what triggered the flag: matched words per level + AI verdict
    await pool.query(`ALTER TABLE flagged_prompts ADD COLUMN IF NOT EXISTS detection JSONB`).catch(() => {});
    // Where it was flagged (dataset_search | ai_search | ai_schema | generate) — used by the student's My Requests page
    await pool.query(`ALTER TABLE flagged_prompts ADD COLUMN IF NOT EXISTS context VARCHAR(20)`).catch(() => {});

    // Class invitation links — per instructor + course
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_invitations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instructor_id UUID NOT NULL,
        course        VARCHAR(100) NOT NULL,
        token         VARCHAR(64) UNIQUE NOT NULL,
        active        BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    // Multi-class enrollment table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_classes (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id    UUID NOT NULL,
        instructor_id UUID NOT NULL,
        course        VARCHAR(100) NOT NULL,
        status        VARCHAR(20) DEFAULT 'pending',
        enrolled_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(student_id, instructor_id, course)
      )
    `).catch(() => {});

    // Migrate existing single-class enrollments into student_classes
    await pool.query(`
      INSERT INTO student_classes (student_id, instructor_id, course, status)
      SELECT u.id, ins.id, u.course, COALESCE(u.approval_status, 'pending')
      FROM users u
      JOIN users ins ON ins.full_name = u.instructor AND ins.is_instructor = TRUE
      WHERE u.instructor IS NOT NULL AND u.course IS NOT NULL
      ON CONFLICT DO NOTHING
    `).catch(() => {});

    // Student invitations sent manually by instructors
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_invitations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instructor_id UUID NOT NULL,
        student_email VARCHAR(255) NOT NULL,
        course        VARCHAR(100),
        token         VARCHAR(64) UNIQUE NOT NULL,
        status        VARCHAR(20) DEFAULT 'pending',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    // Activity log — schema saves, generations, downloads
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        details     JSONB DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
    // Structured logs: severity level, category, readable message, source; system events have no user
    await pool.query(`ALTER TABLE activity_log ALTER COLUMN user_id DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS level VARCHAR(10) DEFAULT 'INFO'`).catch(() => {});
    await pool.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS category VARCHAR(30)`).catch(() => {});
    await pool.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS message TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'server'`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log (created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS activity_log_level_idx ON activity_log (level, created_at DESC)`).catch(() => {});
    // Older rows: fill level/category from the action so filters work on history too
    await pool.query(`
      UPDATE activity_log SET
        level = CASE WHEN action_type IN ('prompt_flagged') THEN 'WARN' ELSE 'INFO' END,
        category = CASE
          WHEN action_type IN ('dataset_search','ai_search') THEN 'search'
          WHEN action_type IN ('schema_generated','schema_saved','dataset_generated') THEN 'generation'
          WHEN action_type IN ('dataset_downloaded','dataset_uploaded') THEN 'dataset'
          WHEN action_type IN ('prompt_flagged','prompt_approved','prompt_rejected') THEN 'moderation'
          WHEN action_type IN ('student_approved','student_rejected') THEN 'class'
          ELSE 'other' END
      WHERE category IS NULL
    `).catch(() => {});

    // Instructor restrictions — custom keywords, allowed categories/purposes, quota
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructor_restrictions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instructor_id   UUID NOT NULL,
        restriction_type VARCHAR(30) NOT NULL,
        value           TEXT NOT NULL,
        action          VARCHAR(20) DEFAULT 'flag',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

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
    const parts = displayName.split(" ");
    const oFirstName = parts[0] || displayName;
    const oLastName  = parts.slice(1).join(" ") || "";
    const newUser = await pool.query(
      "INSERT INTO users (full_name, first_name, last_name, email) VALUES ($1, $2, $3, $4) RETURNING id",
      [displayName, oFirstName, oLastName, email]
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
// ── Login sessions (signed tokens) ────────────────────────────────────────────
// After login the browser gets a signed token and sends it as
// "Authorization: Bearer <token>". The server trusts the token, never a user_id
// typed into a request — so nobody can act as (or read the data of) another user
// just by knowing their ID. The Python service asks /api/auth/me to identify the caller.
const AUTH_TOKEN_TTL = "7d";

function roleOf(user) {
  return user.is_admin ? "admin" : user.is_instructor ? "instructor" : "student";
}

function signAuthToken(user, role = roleOf(user)) {
  return jwt.sign({ sub: user.id, role }, JWT_SECRET, { expiresIn: AUTH_TOKEN_TTL });
}

// Returns { id, role } for a valid token, otherwise null
function authUser(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload?.sub ? { id: String(payload.sub), role: payload.role || "student" } : null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = authUser(req);
  if (!user) {
    return res.status(401).json({ error: "auth_required", message: "Your session has expired or you are not logged in. Please log in again." });
  }
  req.user = user;
  next();
}

function oauthSuccessRedirect(res, user, method = "OAuth") {
  logActivity(user.id, "login_success", { method });
  const params = new URLSearchParams({
    user_id:   user.id,
    user_name: user.full_name,
    is_admin:  user.is_admin ? "true" : "false",
    token:     signAuthToken(user),
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

// Helper para i-check kung Gordon College email ang ginamit
function isAllowedEmail(email) {
  return typeof email === "string" && email.endsWith("@gordoncollege.edu.ph");
}

app.get("/", (_req, res) => res.json({ status: "Backend running" }));

// SIGNUP (email + password)
app.post("/signup", async (req, res) => {
  try {
    const { first_name, last_name, email, password, course, instructor } = req.body;
    if (!first_name || !last_name || !email || !password)
      return res.status(400).json({ error: "first_name, last_name, email, and password are required" });
    if (!isAllowedEmail(email))
      return res.status(403).json({ error: "Only Gordon College email addresses (@gordoncollege.edu.ph) are allowed." });

    const full_name = `${first_name} ${last_name}`.trim();
    const hashed = await bcrypt.hash(password, 10);
    const token  = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, full_name, email, password, email_verified, verification_token, verification_token_expires, course, instructor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, first_name, last_name, full_name, email, created_at`,
      [first_name, last_name, full_name, email, hashed, !EMAIL_READY, EMAIL_READY ? token : null, EMAIL_READY ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null, course || null, instructor || null]
    );
    const user = result.rows[0];
    logActivity(user.id, "signup", { role: "student", course: course || null, instructor: instructor || null });

    if (EMAIL_READY) {
      res.status(201).json({ pending_verification: true, email });
      sendVerificationEmail(email, token).catch((e) => reportEmailFailure("Verification email", e, user.id));
      return;
    }

    // New students start as 'pending' — never sign them in here, even when email
    // verification is off; they must wait for instructor approval like /login enforces
    res.status(201).json({ pending_approval: true, email: user.email });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already exists" });
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// INSTRUCTOR SIGNUP
app.post("/instructor/signup", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;
    if (!first_name || !last_name || !email || !password)
      return res.status(400).json({ error: "first_name, last_name, email, and password are required" });
    if (!isAllowedEmail(email))
      return res.status(403).json({ error: "Only Gordon College email addresses (@gordoncollege.edu.ph) are allowed." });

    const full_name = `${first_name} ${last_name}`.trim();
    const hashed = await bcrypt.hash(password, 10);
    const token  = crypto.randomUUID();

    const created = await pool.query(
      `INSERT INTO users (first_name, last_name, full_name, email, password, email_verified, verification_token, verification_token_expires, is_instructor, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'approved') RETURNING id`,
      [first_name, last_name, full_name, email, hashed, !EMAIL_READY, EMAIL_READY ? token : null, EMAIL_READY ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null]
    );
    logActivity(created.rows[0].id, "signup", { role: "instructor" });

    if (EMAIL_READY) {
      res.status(201).json({ pending_verification: true, email });
      sendVerificationEmail(email, token).catch((e) => reportEmailFailure("Instructor verification email", e, created.rows[0].id));
      return;
    }

    res.status(201).json({ pending_verification: false, email });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already exists" });
    console.error("Instructor signup error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// VERIFY EMAIL
app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect(`${FRONTEND_URL}/login?error=invalid_token`);
  try {
    // Find the user with this token first, regardless of expiry
    const found = await pool.query(
      "SELECT * FROM users WHERE verification_token = $1",
      [token]
    );
    if (found.rows.length === 0)
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_token`);

    const user = found.rows[0];

    // If token is expired, redirect with the user's email so frontend can pre-fill the resend form
    if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date())
      return res.redirect(`${FRONTEND_URL}/login?error=expired_token&email=${encodeURIComponent(user.email)}`);

    // Valid — verify the account
    await pool.query(
      "UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1",
      [user.id]
    );
    logActivity(user.id, "email_verified");
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

    const token   = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3",
      [token, expires, user.id]
    );
    await sendVerificationEmail(email, token);
    res.json({ ok: true });
  } catch (err) {
    console.error("Resend verification error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// FORGOT PASSWORD — sends 6-digit code
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.json({ ok: true }); // don't leak existence

    logActivity(result.rows[0].id, "password_reset_requested");
    const code    = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 1 * 60 * 1000); // 1 minute — same as frontend timer
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3",
      [code, expires, email]
    );

    if (EMAIL_READY) {
      sendPasswordResetEmail(email, code).catch((e) =>
        reportEmailFailure("Password reset email", e)
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// VERIFY RESET CODE — checks if the code is correct without resetting the password yet
app.post("/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "email and code are required" });
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND reset_token = $2 AND reset_token_expires > NOW()",
      [email, code]
    );
    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid or expired code" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Verify reset code error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// RESET PASSWORD — accepts { email, code, password }
app.post("/reset-password", async (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) return res.status(400).json({ error: "email, code, and password are required" });
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND reset_token = $2 AND reset_token_expires > NOW()",
      [email, code]
    );
    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid or expired code" });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE email = $2",
      [hashed, email]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN (email + password)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });
    if (!isAllowedEmail(email))
      return res.status(403).json({ error: "Only Gordon College email addresses (@gordoncollege.edu.ph) are allowed." });

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      logActivity(null, "login_failed", { email, reason: "no account with this email" });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const denyLogin = (reason) => logActivity(user.id, "login_failed", { email, reason });
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      denyLogin("wrong password");
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.email_verified) {
      denyLogin("email not verified");
      return res.status(403).json({ error: "unverified", message: "Please verify your email before logging in." });
    }

    if (user.is_banned) {
      denyLogin("account banned");
      return res.status(403).json({ error: "banned", message: `Your account has been permanently banned. Reason: ${user.ban_reason || "Violation of Terms of Service"}` });
    }

    if (!user.is_admin && user.approval_status === 'terminated') {
      denyLogin("class access terminated");
      return res.status(403).json({ error: "terminated", message: "Your class access has been terminated by the administrator. Please contact your instructor for assistance." });
    }

    if (!user.is_admin && !user.is_instructor && user.approval_status !== 'approved') {
      denyLogin("awaiting instructor approval");
      return res.status(403).json({ error: "pending_approval", message: "Your account is awaiting instructor approval." });
    }

    logActivity(user.id, "login_success", { method: "password", role: user.is_admin ? "admin" : user.is_instructor ? "instructor" : "student" });
    res.json({ id: user.id, first_name: user.first_name, last_name: user.last_name, full_name: user.full_name, email: user.email, is_admin: user.is_admin || false, is_instructor: user.is_instructor || false, tour_done: user.tour_done || false, instructor: user.instructor ?? null, token: signAuthToken(user) });
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
  (req, res) => oauthSuccessRedirect(res, req.user, "GitHub")
);

// ── Google OAuth ──────────────────────────────────────────────────────────────
app.get("/auth/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.redirect(`${FRONTEND_URL}/?oauth_error=Google+OAuth+not+configured`);
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}/?oauth_error=Google+login+failed` }),
  (req, res) => oauthSuccessRedirect(res, req.user, "Google")
);

// ── User profile ──────────────────────────────────────────────────────────────
app.get("/api/users/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, first_name, last_name, full_name, email, username, created_at, tour_done, instructor, course FROM users WHERE id = $1",
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
    const { first_name, last_name, email, username, new_password, current_password } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (first_name !== undefined) { updates.push(`first_name = $${idx++}`); values.push(first_name); }
    if (last_name  !== undefined) { updates.push(`last_name = $${idx++}`);  values.push(last_name); }
    if (first_name !== undefined || last_name !== undefined) {
      updates.push(`full_name = $${idx++}`);
      const curUser = await pool.query("SELECT first_name, last_name FROM users WHERE id = $1", [req.params.id]);
      const fn = first_name ?? curUser.rows[0]?.first_name ?? "";
      const ln = last_name  ?? curUser.rows[0]?.last_name  ?? "";
      values.push(`${fn} ${ln}`.trim());
    }
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
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, first_name, last_name, full_name, email, username, created_at`,
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
    logActivity(user_id, "schema_saved", { schema_name: name, schema_id: result.rows[0].id });
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
    const [users, verified, schemas, datasets, rows, instructors, students] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users"),
      pool.query("SELECT COUNT(*) FROM users WHERE email_verified = TRUE"),
      pool.query("SELECT COUNT(*) FROM schemas"),
      pool.query("SELECT COUNT(*) FROM datasets"),
      pool.query("SELECT COALESCE(SUM(row_count), 0) AS total FROM datasets"),
      pool.query("SELECT COUNT(*) FROM users WHERE is_instructor = TRUE"),
      pool.query("SELECT COUNT(*) FROM users WHERE is_instructor = FALSE AND is_admin = FALSE"),
    ]);
    res.json({
      total_users:      parseInt(users.rows[0].count),
      verified_users:   parseInt(verified.rows[0].count),
      total_schemas:    parseInt(schemas.rows[0].count),
      total_datasets:   parseInt(datasets.rows[0].count),
      total_rows:       parseInt(rows.rows[0].total),
      instructor_count: parseInt(instructors.rows[0].count),
      student_count:    parseInt(students.rows[0].count),
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
        SELECT u.id, COALESCE(u.first_name || ' ' || u.last_name, u.full_name) AS full_name, u.email,
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
        SELECT COALESCE(first_name || ' ' || last_name, full_name) AS full_name, email, created_at
        FROM users ORDER BY created_at DESC LIMIT 5
      `),
      // 5 most recent schemas with owner name
      pool.query(`
        SELECT s.name, s.table_name, s.created_at,
               COALESCE(u.first_name || ' ' || u.last_name, u.full_name) AS user_name
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
      SELECT u.id, u.first_name, u.last_name, COALESCE(u.first_name || ' ' || u.last_name, u.full_name) AS full_name,
             u.email, u.username, u.email_verified, u.is_admin,
             COALESCE(u.is_instructor, FALSE) AS is_instructor,
             u.course, u.instructor, u.approval_status, u.created_at,
             COALESCE(u.strike_count, 0) AS strike_count, COALESCE(u.is_banned, FALSE) AS is_banned, u.ban_reason,
             COALESCE(u.pending_deletion, FALSE) AS pending_deletion,
             u.deletion_scheduled_at, u.deletion_reason,
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

// Schedule deletion — moves user to pending state and sends warning email
app.patch("/api/admin/users/:id/schedule-deletion", requireAdmin, async (req, res) => {
  try {
    const { reason = "Admin-issued deletion", grace_days = 7 } = req.body;
    const deletionDate = new Date(Date.now() + grace_days * 24 * 60 * 60 * 1000);

    const userRes = await pool.query(
      `SELECT COALESCE(first_name || ' ' || last_name, full_name) AS full_name, email,
              username, COALESCE(is_banned, FALSE) AS is_banned
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = userRes.rows[0];

    const schemaRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM schemas WHERE user_id = $1", [req.params.id]);
    const schemaCount = schemaRes.rows[0].cnt;

    // Archive record snapshot
    await pool.query(
      `INSERT INTO user_archive (user_id, full_name, email, username, schema_count, archive_reason, deletion_scheduled_at, is_banned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [req.params.id, user.full_name, user.email, user.username, schemaCount, reason, deletionDate, user.is_banned]
    );

    await pool.query(
      `UPDATE users SET pending_deletion = TRUE, deletion_scheduled_at = $1, deletion_reason = $2 WHERE id = $3`,
      [deletionDate, reason, req.params.id]
    );

    // Send email — non-fatal if email is not configured
    let notified = false;
    if (user.email && EMAIL_READY) {
      try {
        await sendDeletionWarningEmail(user.email, user.full_name, deletionDate, reason);
        await pool.query("UPDATE user_archive SET notified_at = NOW() WHERE user_id = $1", [req.params.id]);
        notified = true;
      } catch (e) {
        reportEmailFailure("Deletion warning email", e);
      }
    }

    res.json({ success: true, deletion_scheduled_at: deletionDate, notified });
  } catch (err) {
    console.error("Admin schedule deletion error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Cancel pending deletion — restores user to normal
app.patch("/api/admin/users/:id/cancel-deletion", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET pending_deletion = FALSE, deletion_scheduled_at = NULL, deletion_reason = NULL WHERE id = $1",
      [req.params.id]
    );
    await pool.query("DELETE FROM user_archive WHERE user_id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin cancel deletion error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Permanently delete a user (hard delete — irreversible)
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM user_archive WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// List archived (pending-deletion) users
app.get("/api/admin/archive", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id AS archive_id, a.user_id, a.full_name, a.email, a.username,
             a.schema_count, a.archive_reason, a.archived_at, a.deletion_scheduled_at,
             a.notified_at, a.is_banned,
             u.pending_deletion
      FROM user_archive a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.deletion_scheduled_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Admin archive list error:", err.message);
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

app.patch("/api/admin/users/:id/toggle-instructor", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_instructor = NOT is_instructor, approval_status = 'approved' WHERE id = $1 RETURNING is_instructor",
      [req.params.id]
    );
    res.json({ is_instructor: result.rows[0].is_instructor });
  } catch (err) {
    console.error("Admin toggle instructor error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
  try {
    const reason = req.query.reason || "Admin-issued ban";
    await pool.query(
      "UPDATE users SET is_banned = TRUE, ban_reason = $1 WHERE id = $2",
      [reason, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Admin ban user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/users/:id/unban", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET is_banned = FALSE, ban_reason = NULL, strike_count = 0 WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Admin unban user error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: remove strikes ─────────────────────────────────────────────────────
app.patch("/api/admin/users/:id/remove-strikes", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET strike_count = 0, is_banned = FALSE, ban_reason = NULL WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Remove strikes error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: courses (class_invitations) ───────────────────────────────────────
app.get("/api/admin/courses", requireAdmin, async (req, res) => {
  try {
    const invites = await pool.query(`
      SELECT ci.*, u.full_name AS instructor_name, u.email AS instructor_email
      FROM class_invitations ci
      JOIN users u ON u.id = ci.instructor_id
      ORDER BY ci.created_at DESC
    `);
    // Attach enrolled students to each course
    const rows = await Promise.all(invites.rows.map(async (inv) => {
      const students = await pool.query(
        `SELECT id, COALESCE(first_name || ' ' || last_name, full_name) AS full_name,
                email, approval_status, created_at
         FROM users
         WHERE course = $1 AND instructor = $2 AND is_instructor = FALSE AND is_admin = FALSE
         ORDER BY created_at DESC`,
        [inv.course, inv.instructor_name]
      );
      return { ...inv, students: students.rows };
    }));
    res.json(rows);
  } catch (err) {
    console.error("Admin courses error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/courses", requireAdmin, async (req, res) => {
  const { instructor_id, course } = req.body;
  if (!instructor_id || !course?.trim()) return res.status(400).json({ error: "instructor_id and course required" });
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const result = await pool.query(
      `INSERT INTO class_invitations (instructor_id, course, token)
       VALUES ($1, $2, $3)
       RETURNING *, (SELECT COALESCE(first_name || ' ' || last_name, full_name) FROM users WHERE id = $1) AS instructor_name`,
      [instructor_id, course.trim(), token]
    );
    res.status(201).json({ ...result.rows[0], students: [] });
  } catch (err) {
    console.error("Admin create course error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_invitations WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete course error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── LLM Schema Generation ─────────────────────────────────────────────────────

const VALID_TYPES = ["string","integer","float","boolean","date","email","uuid","phone","address","name","ip"];

// Enforce correct types based on field name patterns — overrides LLM guesses
function normalizeFieldType(fieldName, currentType) {
  const n = fieldName.toLowerCase().replace(/[\s-]/g, "_");

  if (/email/.test(n)) return "email";
  if (/(phone|mobile|tel|contact_number)/.test(n)) return "phone";
  if (/^(ip_address|ip_addr|source_ip|dest_ip|remote_ip|ip)$/.test(n)) return "ip";
  if (/(^id$|_uuid$|uuid)/.test(n)) return "uuid";

  if (/^(first_name|last_name|full_name|firstname|lastname|fullname|middle_name|author|instructor|teacher|student_name|employee_name|patient_name|owner|recipient|sender)$/.test(n) || /(_name)$/.test(n)) return "name";
  if (/(address|street|city|barangay|province|location|place|region|municipality)/.test(n)) return "address";

  if (/(date|_at|_on|birthday|birth_date|dob|created|updated|modified|timestamp|datetime|start_date|end_date|due_date|expiry|expiration|hire_date|graduation)/.test(n)) return "date";

  if (/^(is_|has_|can_|was_|should_)/.test(n) || /^(active|enabled|disabled|verified|confirmed|approved|deleted|archived|published|visible|available|flagged|banned|completed|passed|failed)$/.test(n)) return "boolean";

  if (/(price|cost|amount|salary|wage|rate|percentage|percent|pct|ratio|gpa|latitude|lat|longitude|lng|lon|temperature|temp|distance|speed|revenue|profit|loss|discount|tax|fee|balance|budget|weight|height_cm|bmi)/.test(n)) return "float";

  if (/^(age|count|quantity|qty|year|month|day|hour|rank|score|rating|votes|likes|views|clicks|downloads|pages|floor|room_number|employee_count|population|zip|postal_code|student_id|employee_id|order_id|product_id|user_id|case_id|ticket_id|invoice_id|port|priority|level|attempts|duration_minutes|duration_days|num_|number_of_|total_)/.test(n)) return "integer";

  return currentType;
}

// ── Flagging pipeline — see moderation.js for exactly what triggers a flag ────
// Level 1 instructor words + Level 3 system words are deterministic rules on the
// raw prompt; Level 2 is the AI reading the prompt for intent. All three run; the
// rules are the fallback when the AI errors, times out, or misses a word.

async function loadClassRestrictions(instructorId) {
  if (!instructorId) return [];
  const r = await pool.query(
    "SELECT restriction_type, value, action FROM instructor_restrictions WHERE instructor_id = $1 AND restriction_type = 'keyword'",
    [instructorId]
  );
  return r.rows;
}

// The AI being down is a system WARN — log it at most every 30 minutes, not on every prompt
let lastAiUnavailableLog = 0;
function noteAiUnavailable(reason) {
  if (Date.now() - lastAiUnavailableLog < 30 * 60 * 1000) return;
  lastAiUnavailableLog = Date.now();
  logEvent({ action: "ai_detection_unavailable", details: { error: reason ?? null } });
}

// Runs all three levels without side effects. Used by the safety check and the instructor's "Test a prompt" tool.
async function evaluatePrompt(prompt, { apiKey, restrictions = [], fieldNames = [], useAi = true } = {}) {
  const { normalized, matches } = moderation.detect(prompt, { restrictions, fieldNames });
  const ai = useAi ? await moderation.aiDetect(prompt, apiKey) : { status: "skipped" };
  if (ai.status === "unavailable") noteAiUnavailable(ai.reason);
  const decision = moderation.decide(matches, ai);
  return { prompt, normalized, matches, ai, ...decision };
}

// ── Shared safety check (check-prompt, generate-schema, generation-time check) ─
async function runSafetyCheck(prompt, user_id, apiKey, instructor_id, { useAi = true, fieldNames = [], context = null } = {}) {
  let instructor = null;
  let restrictions = [];
  if (user_id) {
    try {
      instructor = await resolveReviewInstructor(user_id, instructor_id);
      restrictions = await loadClassRestrictions(instructor?.id);
    } catch (e) {
      console.error("Restriction lookup error:", e.message);
    }
  }

  const detection = await evaluatePrompt(prompt, { apiKey, restrictions, fieldNames, useAi });
  if (!detection.flag) return { safe: true, detection };

  if (detection.block) {
    if (user_id) logActivity(user_id, "prompt_blocked", { prompt_text: prompt, blocked_terms: detection.blocked_terms, triggers: detection.matches });
    return {
      safe: false, error: "blocked_keyword", detection,
      message: `Your prompt contains a word your instructor has blocked (${detection.blocked_terms.map((t) => `"${t}"`).join(", ")}). Please revise it.`,
    };
  }

  if (user_id) {
    try {
      return await openReview(user_id, prompt.trim(), detection.reason, instructor?.id ?? instructor_id, detection, context);
    } catch (e) {
      console.error("Flagging error:", e.message);
      // Fail closed: a flagged prompt must never slip through unreviewed
      return { safe: false, error: "review_unavailable", message: "Your prompt needs instructor review, but the review queue is unavailable right now. Please try again shortly." };
    }
  }

  return {
    safe: false,
    error: "inappropriate_prompt",
    message: "Your query was flagged as inappropriate and cannot be processed.",
    detection,
  };
}

// ── Instructor review transaction: Pending → Approved / Rejected ──────────────
// A flagged prompt opens (or reuses) a review and is locked IMMEDIATELY: the
// search, AI schema, and generation steps are all refused while it is pending.
// Once approved the student continues where they stopped (the approved prompt
// passes from then on). Rejected prompts stay refused. Datasets are still tagged
// with the review ID as a second line of defence (see the Python review lock).
const PENDING_REVIEW_MESSAGE =
  "Your prompt was flagged and sent to your instructor for review. It is locked until your instructor approves it — nothing can be searched or generated with it until then. You'll get an email when they decide.";

async function resolveReviewInstructor(studentId, preferredInstructorId) {
  // 1. The class the student is currently working in (multi-class enrollment)
  if (preferredInstructorId) {
    const r = await pool.query(
      `SELECT u.id, u.email, u.full_name FROM student_classes sc JOIN users u ON u.id = sc.instructor_id
       WHERE sc.student_id = $1 AND sc.instructor_id = $2 AND sc.status = 'approved' LIMIT 1`,
      [studentId, preferredInstructorId]
    );
    if (r.rows.length) return r.rows[0];
  }
  // 2. Legacy single-instructor link on the user record
  const legacy = await pool.query(
    `SELECT i.id, i.email, i.full_name FROM users s JOIN users i ON i.full_name = s.instructor AND i.is_instructor = TRUE
     WHERE s.id = $1 LIMIT 1`,
    [studentId]
  );
  if (legacy.rows.length) return legacy.rows[0];
  // 3. Any class the student is approved in
  const any = await pool.query(
    `SELECT u.id, u.email, u.full_name FROM student_classes sc JOIN users u ON u.id = sc.instructor_id
     WHERE sc.student_id = $1 AND sc.status = 'approved' ORDER BY sc.enrolled_at DESC LIMIT 1`,
    [studentId]
  );
  return any.rows[0] ?? null;
}

async function openReview(studentId, promptText, flagReason, preferredInstructorId, detection = null, context = null) {
  const prior = await pool.query(
    `SELECT id, status FROM flagged_prompts WHERE student_id = $1 AND prompt_text = $2
     ORDER BY created_at DESC LIMIT 1`,
    [studentId, promptText]
  );
  const last = prior.rows[0];
  if (last?.status === "approved") return { safe: true };                       // already cleared by instructor
  // Locked from the moment it is flagged: nothing (search, schema, generation) proceeds until approved
  if (last?.status === "pending")  return { safe: false, error: "pending_review", review_id: last.id, message: PENDING_REVIEW_MESSAGE };
  if (last?.status === "rejected") {
    logActivity(studentId, "prompt_resubmitted_rejected", { prompt_text: promptText, review_id: last.id });
    return { safe: false, error: "prompt_rejected", message: "Your instructor already rejected this prompt. It cannot be used to generate a dataset." };
  }

  const instructor = await resolveReviewInstructor(studentId, preferredInstructorId);
  const inserted = await pool.query(
    "INSERT INTO flagged_prompts (student_id, instructor_id, prompt_text, flag_reason, detection, context) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [studentId, instructor?.id ?? null, promptText, flagReason, detection ? JSON.stringify(detection) : null, context]
  );
  logActivity(studentId, "prompt_flagged", { prompt_text: promptText, flag_reason: flagReason, triggers: detection?.matches ?? [], ai: detection?.ai ?? null });

  if (instructor?.email) {
    const student = await pool.query("SELECT full_name FROM users WHERE id = $1", [studentId]);
    sendFlaggedPromptEmail(instructor.email, instructor.full_name, student.rows[0]?.full_name, promptText)
      .catch((e) => reportEmailFailure("Flagged prompt email", e));
  }
  return { safe: false, error: "pending_review", review_id: inserted.rows[0].id, message: PENDING_REVIEW_MESSAGE };
}

// ── Check prompt safety (called before dataset search) ───────────────────────
app.post("/api/llm/check-prompt", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { prompt, user_id, context, instructor_id } = req.body;
  if (!prompt?.trim()) return res.json({ safe: true });

  // no key = no AI check, keyword check still runs
  const result = await runSafetyCheck(prompt.trim(), user_id, apiKey, instructor_id, {
    context: context === "ai_search" ? "ai_search" : "dataset_search",
  });
  // Record every search the student runs, with the prompt exactly as typed.
  // Flagged searches are already logged as prompt_flagged inside runSafetyCheck.
  if (result.safe && !result.review_id && user_id) {
    logActivity(user_id, context === "ai_search" ? "ai_search" : "dataset_search", { prompt_text: prompt });
  }
  if (result.safe) return res.json({ safe: true });
  // Flagged → 403 with error "pending_review" and the review_id: the search does not run
  return res.status(403).json(result);
});

app.post("/api/llm/generate-schema", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured." });

  const { prompt, user_id, purpose, category, instructor_id } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });

  // ── Moderation: delegate to shared safety-check helper ──────────────────────
  // Flagged prompts still get a schema, but carry a review_id that locks the dataset
  const safetyResult = await runSafetyCheck(prompt.trim(), user_id, apiKey, instructor_id, { context: "ai_schema" });
  if (!safetyResult.safe) {
    // Pending review → no schema is generated (the AI is never asked) until approved
    return res.status(403).json({
      error: safetyResult.error,
      message: safetyResult.message,
      review_id: safetyResult.review_id ?? null,
    });
  }

  const schemaPrompt = `You are a data schema designer. Given a description, return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Return this exact shape:
{
  "table_name": "snake_case_main_table_name",
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
- MULTI-ENTITY RULE: If the description mentions multiple entities (e.g. users, orders, products, reviews, carts, transactions), include fields for EVERY entity using prefix naming: entity_id, entity_name, entity_field. Each entity needs at least entity_id + 2 more prefixed fields. Generate 6-30 fields total to cover all entities.
- SINGLE-ENTITY: If only one entity, generate 5-10 realistic fields for it.
- For each field include ONLY the constraints relevant to its type:
  - integer/float: min_val, max_val, distribution (uniform|normal|skewed)
  - string (categories): enum_values as a comma-separated string like "Low, Medium, High"
  - string (free text): cardinality (number of unique values)
  - boolean: true_ratio (0.0 to 1.0)
  - date: date_from and date_to in YYYY-MM-DD format
- enum_values must always be a plain string, never an array
- ENUM EXTRACTION RULE (most important): If the user's description explicitly lists the allowed values for a field — using words like "one of", "from", "either", "choose from", a parenthesised list, or a colon followed by values — you MUST capture those exact values as enum_values. Examples:
  - "budget_range: Low, Mid, or High" → enum_values: "Low, Mid, High"
  - "barangay: real barangay from Olongapo City (East Tapinac, West Tapinac, Sta. Rita)" → enum_values: "East Tapinac, West Tapinac, Sta. Rita"
  - "status is either Active or Inactive" → enum_values: "Active, Inactive"
  - "age_group: 18-25, 26-35, or 36-50" → enum_values: "18-25, 26-35, 36-50"
  - "gender: M or F" → enum_values: "M, F"
  - "preferred_occasions: 1-2 from: Birthday, Fiesta, Christmas, New Year" → enum_values: "Birthday, Fiesta, Christmas, New Year"
  Never ignore explicit value lists in the prompt. Always set them as enum_values even if the field type is string.
- RANGE RULE: If the user specifies a numeric range (e.g. "lat: between 14.80 and 14.85"), set min_val and max_val to those exact numbers.
- DATE RANGE RULE: If the user specifies a date range (e.g. "created_at: between 2022-01-01 and 2024-12-31"), set date_from and date_to to those exact values.
- DESCRIPTION + ENUM CONSISTENCY: For every categorical string field, the description MUST explicitly state the allowed values AND enum_values must contain the same values. Example: if budget_range has enum_values "Low, Mid, High", the description should say "Customer budget level — Low, Mid, or High". This creates a two-layer guarantee so the generator can extract values from either source.
- CRITICAL for descriptions: always include the domain/industry context for name-type fields:
  - Grocery store → "Name of the grocery product in store inventory"
  - Clothing boutique → "Name of the clothing item"
  - Hospital → "Name of the pharmaceutical product"
  - Restaurant → "Name of the menu dish or beverage"
  - Bookstore → "Title of the book"
  Never write just "Product name" — always say what KIND of product.
- LOCALE RULE: If the description mentions a country or city, always include that location in the descriptions of phone, address, city, and contact fields so locale-aware generation can use the right format. Examples:
  - "in the Philippines" → phone description: "Philippine mobile number in +63 format", address description: "Full Philippine address with barangay, city, and province"
  - "in the US" → phone description: "US phone number", address description: "US street address"

Description: ${prompt.trim()}`;

  try {
    // ── Anthropic / Claude Haiku ──────────────────────────────────────────────
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
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
    if (user_id) logActivity(user_id, "schema_generated", { prompt_text: prompt, table_name: schema.table_name, purpose: purpose ?? null, category: category ?? null });

    schema.fields = schema.fields.map((f) => {
      const c = f.constraints ?? {};
      // Ensure enum_values is always a plain string (never an array)
      if (Array.isArray(c.enum_values)) c.enum_values = c.enum_values.join(", ");
      return {
        name:        f.name,
        type:        normalizeFieldType(f.name, VALID_TYPES.includes(f.type) ? f.type : "string"),
        nullable:    Boolean(f.nullable),
        null_rate:   typeof f.null_rate === "number" ? f.null_rate : 0,
        constraints: c,
        description: f.description ?? "",
      };
    });

    res.json({ ...schema, review_id: safetyResult.review_id ?? null, review_message: safetyResult.message ?? null });
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

// ── Augment schema: LLM identifies fields missing from a real dataset ─────────

app.post("/api/llm/augment-schema", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured." });

  const { existing_schema, user_prompt, detected_extras } = req.body;
  if (!Array.isArray(existing_schema) || !user_prompt?.trim()) {
    return res.status(400).json({ error: "existing_schema (array) and user_prompt are required" });
  }

  const existingNames = existing_schema.map((f) => f.name).join(", ");
  const extrasNote = Array.isArray(detected_extras) && detected_extras.length > 0
    ? `\n\nThe system also detected these explicit domain requirements from the prompt: ${detected_extras.join(", ")}. Add the most important fields for each of these domains if not already present.`
    : "";

  const augmentPrompt = `You are a data schema augmenter for synthetic dataset generation.

The user described a dataset: "${user_prompt.trim()}"
A real dataset was found that already has these columns: ${existingNames}${extrasNote}

Your job — add fields that are MISSING from the real dataset but are:
1. Explicitly mentioned in the user's prompt (e.g. "with hospitals" → add hospital_name, ward, etc.)
2. Part of a domain/context the user stated (e.g. "diabetes with hospitals" → add hospital_id, hospital_name, ward, admission_date)
3. Required to make the dataset complete for the user's stated use case

Rules:
- Do NOT duplicate fields already in the dataset (the existing columns listed above)
- Do NOT add completely generic fields with no connection to the user's prompt
- For each detected domain/context, add 2-4 relevant fields
- Use snake_case field names
- ENUM EXTRACTION: If the user's prompt explicitly lists allowed values for a field, set those exact values as enum_values (plain comma-separated string). Examples:
  - "budget_range: Low, Mid, or High" → constraints: { "enum_values": "Low, Mid, High" }
  - "status is Active or Inactive" → constraints: { "enum_values": "Active, Inactive" }
- RANGE: If the prompt specifies a numeric range, set min_val and max_val accordingly.

Return ONLY valid JSON — no markdown, no explanation:
{
  "fields": [
    {
      "name": "field_name",
      "type": "one_of_valid_types",
      "description": "brief reason based on user request",
      "constraints": {}
    }
  ]
}

Valid types: ${VALID_TYPES.join(", ")}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: augmentPrompt }],
    });
    let raw = message.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const result = JSON.parse(raw);
    if (!Array.isArray(result.fields)) throw new Error("Invalid response shape");

    result.fields = result.fields.map((f) => ({
      name:        f.name,
      type:        VALID_TYPES.includes(f.type) ? f.type : "string",
      description: f.description ?? "",
      constraints: (() => {
        const c = f.constraints ?? {};
        if (Array.isArray(c.enum_values)) c.enum_values = c.enum_values.join(", ");
        return c;
      })(),
    }));

    res.json({ fields: result.fields });
  } catch (err) {
    console.error("augment-schema error:", err.message);
    res.status(500).json({ error: err.message || "Augmentation failed" });
  }
});

// ── Dataset endpoints ─────────────────────────────────────────────────────────
const PYTHON_DATASETS_DIR = path.join(__dirname, "python", "temp_datasets");
const REVIEW_TO_DATASET_STATUS = { pending: "pending_review", approved: "ready", rejected: "rejected" };

// ── Student: My Requests — their own flagged prompts and the instructor's decision ──
app.get("/api/student/reviews", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT fp.id, fp.prompt_text, fp.status, fp.context, fp.created_at, fp.reviewed_at,
              COALESCE(rv.full_name, ins.full_name) AS instructor_name,
              (SELECT COUNT(*)::int FROM datasets d WHERE d.review_id = fp.id) AS datasets
       FROM flagged_prompts fp
       LEFT JOIN users rv  ON rv.id  = fp.reviewed_by
       LEFT JOIN users ins ON ins.id = fp.instructor_id
       WHERE fp.student_id = $1
       ORDER BY fp.created_at DESC
       LIMIT 200`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("Student reviews error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Review status — the Python service calls this before serving a locked dataset,
// and the Schema Builder polls it to show when the lock is lifted.
app.get("/api/reviews/:id/status", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT status, reviewed_at FROM flagged_prompts WHERE id = $1",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Review not found" });
    res.json({ status: r.rows[0].status, reviewed_at: r.rows[0].reviewed_at });
  } catch (err) {
    // Malformed UUIDs land here too
    res.status(404).json({ error: "Review not found" });
  }
});

// Who is calling — used by the Python service before it serves or writes a dataset
app.get("/api/auth/me", requireAuth, (req, res) => res.json(req.user));

// May the caller access this generated dataset? (owner or admin)
app.get("/api/datasets/access/:pythonDatasetId", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "admin") return res.json({ allowed: true, owner_id: null });
    const r = await pool.query(
      "SELECT user_id FROM datasets WHERE python_dataset_id = $1 LIMIT 1",
      [req.params.pythonDatasetId]
    );
    const owner = r.rows[0]?.user_id ?? null;
    res.json({ allowed: !!owner && owner === req.user.id, owner_id: owner });
  } catch (err) {
    console.error("Dataset access check error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/datasets", requireAuth, async (req, res) => {
  try {
    // The owner is whoever is logged in — a user_id sent in the body is ignored
    const user_id = req.user.id;
    const { name, kaggle_ref, python_dataset_id, row_count, source, purpose, category, review_id } = req.body;
    if (!user_id || !name)
      return res.status(400).json({ error: "user_id and name are required" });

    // Datasets produced under a flagged prompt start locked until the instructor decides
    let status = "ready";
    let reviewId = null;
    if (review_id) {
      const review = await pool.query(
        "SELECT status FROM flagged_prompts WHERE id = $1 AND student_id = $2",
        [review_id, user_id]
      );
      if (review.rows.length) {
        reviewId = review_id;
        status = REVIEW_TO_DATASET_STATUS[review.rows[0].status] ?? "pending_review";
      }
    }

    const result = await pool.query(
      `INSERT INTO datasets (user_id, name, kaggle_ref, python_dataset_id, row_count, source, status, review_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user_id, name, kaggle_ref || null, python_dataset_id || null, row_count || 0, source || "llm", status, reviewId]
    );
    logActivity(user_id, "dataset_generated", {
      table_name: name, rows: row_count || 0, source: source || "llm",
      kaggle_ref: kaggle_ref || null, purpose: purpose ?? null, category: category ?? null,
      dataset_id: result.rows[0].id, locked: status === "pending_review", review_id: reviewId,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Register dataset error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/datasets/:userId", requireAuth, async (req, res) => {
  if (req.user.id !== req.params.userId && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden", message: "You can only view your own datasets." });
  }
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

app.delete("/api/datasets/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM datasets WHERE id = $1 AND (user_id = $2 OR $3) RETURNING python_dataset_id, user_id, name, row_count",
      [req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Dataset not found" });
    if (result.rowCount > 0) {
      const d = result.rows[0];
      logActivity(d.user_id, "dataset_deleted", { table_name: d.name, rows: d.row_count, dataset_id: req.params.id });
    }
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

// ── Search query expansion ────────────────────────────────────────────────────
app.post("/api/llm/expand-search-query", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "query is required" });

  // If no API key, return empty so caller falls back to domain map
  if (!apiKey) return res.json({ terms: [] });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Given this dataset search query: "${query.trim()}"
Return ONLY a JSON array of 5–6 short search terms (1–2 words each) — synonyms and related keywords. No explanation.
Example: ["term1", "term two", "term3"]`,
      }],
    });
    const raw = message.content[0].text.trim();
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const terms = JSON.parse(match[0]);
      return res.json({ terms: terms.map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8) });
    }
    res.json({ terms: [] });
  } catch (err) {
    console.error("expand-search-query error:", err.message);
    res.json({ terms: [] }); // silent fallback — caller uses domain map
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// ── Instructor routes ─────────────────────────────────────────────────────────

app.post("/instructor/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });

    const result = await pool.query("SELECT * FROM instructors WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      logActivity(null, "login_failed", { email, reason: "no instructor account with this email" });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const instructor = result.rows[0];
    if (!(await bcrypt.compare(password, instructor.password))) {
      logActivity(null, "login_failed", { email, reason: "wrong password (instructor)" });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    logActivity(instructor.id, "login_success", { method: "password", role: "instructor" });
    res.json({ id: instructor.id, name: instructor.name, email: instructor.email, token: signAuthToken(instructor, "instructor") });
  } catch (err) {
    console.error("Instructor login error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all students under this instructor (pending + approved)
app.get("/instructor/students", async (req, res) => {
  try {
    const { instructor_id } = req.query;
    if (!instructor_id) return res.status(400).json({ error: "instructor_id is required" });
    const result = await pool.query(
      `SELECT u.id, COALESCE(u.first_name || ' ' || u.last_name, u.full_name) AS full_name,
              u.email, sc.course, sc.status AS approval_status, sc.enrolled_at AS created_at, sc.id AS enrollment_id
       FROM student_classes sc
       JOIN users u ON u.id = sc.student_id
       WHERE sc.instructor_id = $1
       ORDER BY CASE WHEN sc.status = 'pending' THEN 0 ELSE 1 END, sc.enrolled_at DESC`,
      [instructor_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Instructor students error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Approve a student (class-level)
app.post("/instructor/approve/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { instructor_id } = req.body ?? {};
    // Update the specific class enrollment
    if (instructor_id) {
      await pool.query(
        `UPDATE student_classes SET status = 'approved' WHERE student_id = $1 AND instructor_id = $2`,
        [userId, instructor_id]
      );
    }
    // Also approve at account level so student can log in
    const result = await pool.query(
      "UPDATE users SET approval_status = 'approved' WHERE id = $1 RETURNING email, COALESCE(first_name || ' ' || last_name, full_name) AS full_name",
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const { email, full_name } = result.rows[0];
    if (EMAIL_READY) sendApprovalEmail(email, full_name).catch((e) => reportEmailFailure("Approval email", e));
    if (instructor_id) logActivity(instructor_id, "student_approved", { student_name: full_name, student_email: email });
    res.json({ ok: true });
  } catch (err) {
    console.error("Approve student error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Reject a student (class-level)
app.post("/instructor/reject/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { instructor_id } = req.body ?? {};
    if (instructor_id) {
      await pool.query(
        `UPDATE student_classes SET status = 'rejected' WHERE student_id = $1 AND instructor_id = $2`,
        [userId, instructor_id]
      );
    }
    const result = await pool.query(
      "SELECT COALESCE(first_name || ' ' || last_name, full_name) AS full_name FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (instructor_id) logActivity(instructor_id, "student_rejected", { student_name: result.rows[0].full_name });
    res.json({ ok: true });
  } catch (err) {
    console.error("Reject student error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Public: list all active instructors ──────────────────────────────────────
app.get("/api/instructors", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, COALESCE(first_name || ' ' || last_name, full_name) AS full_name
       FROM users WHERE is_instructor = TRUE AND is_banned = FALSE
       ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get instructors error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Instructor restrictions (per course) ─────────────────────────────────────

// Public: students fetch restrictions by instructor name + course
app.get("/api/restrictions", async (req, res) => {
  const { instructor_name, course } = req.query;
  if (!instructor_name) return res.json({ max_rows: null, allowed_formats: null });
  try {
    // Find instructor UUID by name
    const ins = await pool.query(
      "SELECT id FROM users WHERE full_name = $1 AND is_instructor = TRUE LIMIT 1",
      [instructor_name]
    );
    if (!ins.rows.length) return res.json({ max_rows: null, allowed_formats: null });
    const instructorId = ins.rows[0].id;

    if (course) {
      // Course-level restriction
      const r = await pool.query(
        "SELECT max_rows, allowed_formats FROM instructor_course_restrictions WHERE instructor_id = $1 AND course = $2 LIMIT 1",
        [instructorId, course]
      );
      return res.json(r.rows[0] ?? { max_rows: null, allowed_formats: null });
    }
    // Fallback: no course provided — return nulls
    res.json({ max_rows: null, allowed_formats: null });
  } catch (err) {
    console.error("Restrictions fetch error:", err.message);
    res.json({ max_rows: null, allowed_formats: null });
  }
});

// Instructor: get distinct courses they handle
app.get("/api/instructor/:id/courses", async (req, res) => {
  try {
    const ins = await pool.query(
      "SELECT full_name FROM users WHERE id = $1 AND is_instructor = TRUE LIMIT 1",
      [req.params.id]
    );
    if (!ins.rows.length) return res.status(404).json({ error: "Instructor not found" });
    const name = ins.rows[0].full_name;

    // Courses from invite links
    const invCourses = await pool.query(
      "SELECT DISTINCT course FROM class_invitations WHERE instructor_id = $1",
      [req.params.id]
    );
    // Courses from enrolled students
    const stuCourses = await pool.query(
      "SELECT DISTINCT course FROM users WHERE instructor = $1 AND is_instructor = FALSE AND course IS NOT NULL",
      [name]
    );

    const all = new Set([
      ...invCourses.rows.map((r) => r.course),
      ...stuCourses.rows.map((r) => r.course),
    ]);
    res.json([...all].sort());
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Instructor: get all their course restrictions
app.get("/api/instructor/:id/course-restrictions", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT course, max_rows, allowed_formats FROM instructor_course_restrictions WHERE instructor_id = $1 ORDER BY course",
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Instructor: upsert restrictions for one course
app.put("/api/instructor/:id/course-restrictions", async (req, res) => {
  const { course, max_rows, allowed_formats } = req.body;
  if (!course) return res.status(400).json({ error: "course required" });
  try {
    await pool.query(
      `INSERT INTO instructor_course_restrictions (instructor_id, course, max_rows, allowed_formats, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (instructor_id, course)
       DO UPDATE SET max_rows = $3, allowed_formats = $4, updated_at = NOW()`,
      [req.params.id, course, max_rows ?? null, allowed_formats ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Course restrictions update error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Mark onboarding tour as done ─────────────────────────────────────────────
app.patch("/api/user/tour-done", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  try {
    await pool.query("UPDATE users SET tour_done = TRUE WHERE id = $1", [user_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Tour done error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Activity log (frontend calls this for downloads) ─────────────────────────
app.post("/api/activity/log", async (req, res) => {
  const { user_id, action_type, details } = req.body;
  if (!user_id || !action_type) return res.status(400).json({ error: "user_id and action_type required" });
  if (!CLIENT_ACTIONS.has(action_type)) return res.status(400).json({ error: "Unknown action_type" });
  const safeDetails = details && typeof details === "object" ? details : {};
  await logEvent({ action: action_type, userId: user_id, details: { ...safeDetails, client: String(req.get("user-agent") ?? "").slice(0, 160) }, source: "browser" });
  res.json({ ok: true });
});

// ── Instructor: flagged prompts ───────────────────────────────────────────────
app.get("/instructor/flagged-prompts", async (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: "instructor_id required" });
  try {
    const ins = await pool.query("SELECT full_name FROM users WHERE id = $1", [instructor_id]);
    if (!ins.rows.length) return res.status(404).json({ error: "Instructor not found" });
    const result = await pool.query(
      `SELECT fp.*, u.full_name AS student_name, u.email AS student_email,
              (SELECT COUNT(*)::int FROM datasets d WHERE d.review_id = fp.id) AS locked_datasets
       FROM flagged_prompts fp
       JOIN users u ON u.id = fp.student_id
       WHERE fp.instructor_id = $1
       ORDER BY fp.created_at DESC`,
      [instructor_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get flagged prompts error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/instructor/flagged-prompts/:id/approve", async (req, res) => {
  const { instructor_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE flagged_prompts SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 RETURNING student_id, prompt_text`,
      [instructor_id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    const { student_id, prompt_text } = result.rows[0];
    // Unlock every dataset produced under this review
    await pool.query("UPDATE datasets SET status = 'ready' WHERE review_id = $1", [req.params.id]);
    const [student, instructor] = await Promise.all([
      pool.query("SELECT email, full_name FROM users WHERE id = $1", [student_id]),
      instructor_id ? pool.query("SELECT full_name FROM users WHERE id = $1", [instructor_id]) : Promise.resolve({ rows: [] }),
    ]);
    const instructorName = instructor.rows[0]?.full_name ?? null;
    if (student.rows.length && EMAIL_READY) {
      sendPromptApprovedEmail(student.rows[0].email, student.rows[0].full_name, prompt_text, instructorName)
        .catch((e) => reportEmailFailure("Prompt approved email", e));
    }
    if (instructor_id) logActivity(instructor_id, "prompt_approved", { student_name: student.rows[0]?.full_name, prompt_text });
    res.json({ ok: true });
  } catch (err) {
    console.error("Approve prompt error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/instructor/flagged-prompts/:id/reject", async (req, res) => {
  const { instructor_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE flagged_prompts SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 RETURNING student_id, prompt_text`,
      [instructor_id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    const { student_id, prompt_text } = result.rows[0];

    // Datasets produced under this review stay locked for good (Python deletes the files on next access)
    await pool.query("UPDATE datasets SET status = 'rejected' WHERE review_id = $1", [req.params.id]);

    // Apply a strike and check for ban
    await pool.query(
      "UPDATE users SET strike_count = COALESCE(strike_count, 0) + 1 WHERE id = $1",
      [student_id]
    );
    await pool.query(
      `UPDATE users SET is_banned = TRUE, ban_reason = 'Repeated inappropriate dataset generation attempts (3 strikes)'
       WHERE id = $1 AND strike_count >= 3`,
      [student_id]
    );

    // Fetch student + instructor info to send rejection email
    const [studentRes, instructorRes] = await Promise.all([
      pool.query("SELECT email, full_name, strike_count FROM users WHERE id = $1", [student_id]),
      instructor_id ? pool.query("SELECT full_name FROM users WHERE id = $1", [instructor_id]) : Promise.resolve({ rows: [] }),
    ]);
    const student = studentRes.rows[0];
    const instructorName = instructorRes.rows[0]?.full_name ?? null;
    if (student && EMAIL_READY) {
      sendPromptRejectedEmail(student.email, student.full_name, prompt_text, instructorName, student.strike_count)
        .catch((e) => reportEmailFailure("Prompt rejected email", e));
    }

    if (instructor_id) logActivity(instructor_id, "prompt_rejected", { student_name: student?.full_name, prompt_text });
    res.json({ ok: true });
  } catch (err) {
    console.error("Reject prompt error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Rule-level trigger words found in a prompt (for highlighting in instructor views)
function promptTriggers(promptText, restrictions) {
  if (!promptText) return [];
  return moderation.detect(String(promptText), { restrictions }).matches
    .filter((m) => m.action !== "exempt")
    .map((m) => ({ level: m.level, term: m.term, matched: m.matched, category: m.category }));
}

// ── Log explorer (instructor + admin) ─────────────────────────────────────────
// Filters: level=INFO,WARN,ERROR · category=auth|search|… · since=1h|24h|7d|30d|all
//          q=free text (message, action, student name/email) · limit (max 1000)
// Returns { logs, counts: {INFO, WARN, ERROR} } — counts ignore the level filter,
// like the stat panels on a Grafana dashboard.
const SINCE_INTERVALS = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

async function queryLogs(scopeSql, scopeParams, query, restrictions = []) {
  const where = [scopeSql];
  const params = [...scopeParams];
  const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };

  if (SINCE_INTERVALS[query.since]) where.push(`al.created_at >= NOW() - INTERVAL '${SINCE_INTERVALS[query.since]}'`);
  if (query.category) add("al.category = ?", String(query.category));
  if (query.user_id) add("al.user_id = ?", String(query.user_id));
  if (query.q) {
    params.push(`%${String(query.q).slice(0, 100)}%`);
    const n = `$${params.length}`;
    where.push(`(al.message ILIKE ${n} OR al.action_type ILIKE ${n} OR u.full_name ILIKE ${n} OR u.email ILIKE ${n} OR al.details::text ILIKE ${n})`);
  }
  const baseWhere = where.join(" AND ");

  const levels = String(query.level ?? "").split(",").map((l) => l.trim().toUpperCase()).filter((l) => ["INFO", "WARN", "ERROR"].includes(l));
  const levelSql = levels.length ? ` AND al.level = ANY($${params.length + 1})` : "";
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 1000);

  const [logs, counts] = await Promise.all([
    pool.query(
      `SELECT al.id, al.user_id, al.action_type, al.details, al.created_at,
              COALESCE(al.level, 'INFO') AS level, COALESCE(al.category, 'other') AS category, al.message, al.source,
              u.full_name AS actor_name, u.email AS actor_email,
              CASE WHEN al.user_id IS NULL THEN 'system' WHEN u.is_admin THEN 'admin' WHEN u.is_instructor THEN 'instructor' ELSE 'student' END AS actor_role
       FROM activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${baseWhere}${levelSql}
       ORDER BY al.created_at DESC
       LIMIT ${limit}`,
      levels.length ? [...params, levels] : params
    ),
    pool.query(
      `SELECT COALESCE(al.level, 'INFO') AS level, COUNT(*)::int AS n
       FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
       WHERE ${baseWhere} GROUP BY 1`,
      params
    ),
  ]);

  const tally = { INFO: 0, WARN: 0, ERROR: 0 };
  for (const r of counts.rows) tally[r.level] = r.n;
  return {
    logs: logs.rows.map((row) => ({
      ...row,
      message: row.message || describeLog(row.action_type, row.details).message,
      triggers: promptTriggers(row.details?.prompt_text, restrictions),
    })),
    counts: tally,
  };
}

// Instructor scope: ONLY the students enrolled (approved) in this instructor's
// classes. The instructor's own actions and system-wide events are admin-only.
// The instructor is identified by their login token, not by an ID in the URL.
app.get("/instructor/logs", requireAuth, async (req, res) => {
  if (req.user.role !== "instructor" && req.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden", message: "Only instructors can view class activity." });
  }
  const instructorId = req.user.id;
  try {
    const scope = `(
      al.user_id IS NOT NULL
      AND COALESCE(u.is_instructor, FALSE) = FALSE
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND EXISTS (
        SELECT 1 FROM student_classes sc
        WHERE sc.student_id = u.id AND sc.instructor_id = $1 AND sc.status = 'approved'
      )
    )`;
    const restrictions = await loadClassRestrictions(instructorId);
    res.json(await queryLogs(scope, [instructorId], req.query, restrictions));
  } catch (err) {
    console.error("Instructor logs error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin scope: everything, including anonymous failed logins and all system events
app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  try {
    res.json(await queryLogs("TRUE", [], req.query));
  } catch (err) {
    console.error("Admin logs error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Instructor: activity feed ─────────────────────────────────────────────────
app.get("/instructor/activity", async (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: "instructor_id required" });
  try {
    const ins = await pool.query("SELECT full_name FROM users WHERE id = $1", [instructor_id]);
    if (!ins.rows.length) return res.status(404).json({ error: "Instructor not found" });
    const instructorName = ins.rows[0].full_name;
    // Students enrolled in any of this instructor's classes (multi-class), plus legacy single-instructor link
    const result = await pool.query(
      `SELECT al.*, u.full_name AS student_name, u.email AS student_email
       FROM activity_log al
       JOIN users u ON u.id = al.user_id
       WHERE u.is_instructor = FALSE
         AND (
           u.instructor = $1
           OR EXISTS (
             SELECT 1 FROM student_classes sc
             WHERE sc.student_id = u.id AND sc.instructor_id = $2 AND sc.status = 'approved'
           )
         )
       ORDER BY al.created_at DESC
       LIMIT 1000`,
      [instructorName, instructor_id]
    );
    // Same detector as the live check, so the red "suspicious" rows match what actually gets flagged
    const restrictions = await loadClassRestrictions(instructor_id);
    res.json(result.rows.map((row) => ({ ...row, triggers: promptTriggers(row.details?.prompt_text, restrictions) })));
  } catch (err) {
    console.error("Activity feed error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Instructor: full prompt history (flagged + successful) ───────────────────
app.get("/instructor/prompt-history", async (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: "instructor_id required" });
  try {
    const ins = await pool.query("SELECT full_name FROM users WHERE id = $1", [instructor_id]);
    if (!ins.rows.length) return res.status(404).json({ error: "Instructor not found" });
    const instructorName = ins.rows[0].full_name;

    const inClass = `(
      u.instructor = $1
      OR EXISTS (
        SELECT 1 FROM student_classes sc
        WHERE sc.student_id = u.id AND sc.instructor_id = $2 AND sc.status = 'approved'
      )
    )`;

    // Flagged prompts
    const flagged = await pool.query(
      `SELECT fp.id, u.full_name AS student_name, u.email AS student_email,
              fp.prompt_text, fp.flag_reason, fp.status, fp.created_at,
              'flagged' AS source
       FROM flagged_prompts fp
       JOIN users u ON u.id = fp.student_id
       WHERE ${inClass}
       ORDER BY fp.created_at DESC`,
      [instructorName, instructor_id]
    );

    // Searches and successful schema generation prompts from activity_log
    const generated = await pool.query(
      `SELECT al.id, u.full_name AS student_name, u.email AS student_email,
              al.details->>'prompt_text' AS prompt_text,
              NULL AS flag_reason, NULL AS status, al.created_at,
              'generated' AS source
       FROM activity_log al
       JOIN users u ON u.id = al.user_id
       WHERE ${inClass}
         AND al.action_type IN ('schema_generated', 'dataset_search', 'ai_search')
         AND al.details->>'prompt_text' IS NOT NULL
       ORDER BY al.created_at DESC`,
      [instructorName, instructor_id]
    );

    // Merge and sort by created_at descending
    const combined = [...flagged.rows, ...generated.rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const restrictions = await loadClassRestrictions(instructor_id);
    res.json(combined.map((row) => ({ ...row, triggers: promptTriggers(row.prompt_text, restrictions) })));
  } catch (err) {
    console.error("Prompt history error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Instructor: invite links ──────────────────────────────────────────────────
app.post("/instructor/invite", async (req, res) => {
  const { instructor_id, course } = req.body;
  if (!instructor_id || !course) return res.status(400).json({ error: "instructor_id and course required" });
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const result = await pool.query(
      "INSERT INTO class_invitations (instructor_id, course, token) VALUES ($1, $2, $3) RETURNING *",
      [instructor_id, course, token]
    );
    logActivity(instructor_id, "invite_created", { course });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create invite error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/instructor/invites", async (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: "instructor_id required" });
  try {
    const result = await pool.query(
      "SELECT * FROM class_invitations WHERE instructor_id = $1 ORDER BY created_at DESC",
      [instructor_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/instructor/invites/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM class_invitations WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/instructor/invites/:id/toggle", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE class_invitations SET active = NOT active WHERE id = $1 RETURNING active",
      [req.params.id]
    );
    res.json({ active: result.rows[0].active });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ── Instructor Restrictions (keywords, categories, purposes, quota) ──────────

app.get("/api/instructor/:id/restrictions", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM instructor_restrictions WHERE instructor_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/instructor/:id/restrictions", async (req, res) => {
  const { restriction_type, value, action } = req.body;
  if (!restriction_type || !value?.trim()) return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await pool.query(
      "INSERT INTO instructor_restrictions (instructor_id, restriction_type, value, action) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.params.id, restriction_type, value.trim(), action || "flag"]
    );
    logActivity(req.params.id, "restriction_added", { restriction_type, value: value.trim(), action: action || "flag" });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.delete("/api/instructor/:id/restrictions/:rId", async (req, res) => {
  try {
    const removed = await pool.query(
      "DELETE FROM instructor_restrictions WHERE id = $1 AND instructor_id = $2 RETURNING restriction_type, value",
      [req.params.rId, req.params.id]
    );
    if (removed.rowCount) logActivity(req.params.id, "restriction_removed", removed.rows[0]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Server error" }); }
});

// Students fetch their active class's restrictions before generating
app.get("/api/class-restrictions", async (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: "instructor_id required" });
  try {
    const result = await pool.query(
      "SELECT * FROM instructor_restrictions WHERE instructor_id = $1 ORDER BY created_at ASC",
      [instructor_id]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: "Server error" }); }
});

// Daily generation count for quota enforcement
app.get("/api/student/:id/daily-count", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM activity_log
       WHERE user_id = $1 AND action_type = 'schema_generated'
       AND created_at >= NOW() - INTERVAL '1 day'`,
      [req.params.id]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch { res.status(500).json({ error: "Server error" }); }
});

// ── Moderation endpoints ──────────────────────────────────────────────────────

// Generation-time check (Levels 1 + 3, no AI — the prompt was already AI-checked at search time).
// Scans the prompt AND the dataset's column names against the class's trigger words.
app.post("/api/moderation/check-generation", async (req, res) => {
  const { student_id, instructor_id, prompt, field_names } = req.body;
  if (!student_id) return res.status(400).json({ error: "student_id required" });
  const fieldNames = Array.isArray(field_names) ? field_names.map(String) : [];
  const text = String(prompt ?? "").trim() || fieldNames.join(" ");
  if (!text) return res.json({ ok: true, review_id: null });
  try {
    const result = await runSafetyCheck(text, student_id, null, instructor_id, { useAi: false, fieldNames, context: "generate" });
    if (!result.safe) return res.status(403).json(result);
    res.json({ ok: true, review_id: result.review_id ?? null, message: result.message ?? null, reason: result.detection?.reason ?? null });
  } catch (e) {
    console.error("check-generation error:", e.message);
    res.status(500).json({ error: "review_unavailable", message: "Could not check your prompt right now. Please try again." });
  }
});

// The Level 3 list shown to instructors — the same list the detector uses
app.get("/api/moderation/system-triggers", (_req, res) => {
  res.json(moderation.SYSTEM_TRIGGERS.map((t) => ({
    term: t.term, category: t.category, examples: t.examples,
    context_rule: t.exempt ? "Not flagged when the prompt is clearly about real fishing/fisheries — unless it also mentions emails, links, passwords, accounts, etc." : null,
  })));
});

// Instructor "Test a prompt" tool — runs all three levels and explains the result. Nothing is saved.
app.post("/api/moderation/test", async (req, res) => {
  const { prompt, instructor_id, use_ai = true, field_names } = req.body;
  if (!String(prompt ?? "").trim()) return res.status(400).json({ error: "prompt required" });
  try {
    const restrictions = await loadClassRestrictions(instructor_id);
    const result = await evaluatePrompt(String(prompt), {
      apiKey: process.env.ANTHROPIC_API_KEY, restrictions, useAi: !!use_ai,
      fieldNames: Array.isArray(field_names) ? field_names.map(String) : [],
    });
    res.json(result);
  } catch (e) {
    console.error("moderation test error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Student manually flags a prompt due to custom keyword match
app.post("/api/student/flag-prompt", async (req, res) => {
  const { student_id, instructor_id, prompt_text, flag_reason } = req.body;
  if (!student_id || !prompt_text) return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await openReview(student_id, prompt_text.trim(), flag_reason || "Custom keyword match", instructor_id);
    if (!result.safe) return res.status(403).json(result);
    res.json({ ok: true, review_id: result.review_id ?? null, message: result.message ?? null });
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.get("/invite/:token", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ci.*, u.full_name AS instructor_name
       FROM class_invitations ci
       JOIN users u ON u.id = ci.instructor_id
       WHERE ci.token = $1 AND ci.active = TRUE`,
      [req.params.token]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Invalid or expired invitation" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Logged-in student joins a class via invite link
app.post("/api/class-invite/join", async (req, res) => {
  const { token, user_id } = req.body;
  if (!token || !user_id) return res.status(400).json({ error: "token and user_id required" });
  try {
    const inv = await pool.query(
      `SELECT ci.*, u.full_name AS instructor_name
       FROM class_invitations ci JOIN users u ON u.id = ci.instructor_id
       WHERE ci.token = $1 AND ci.active = TRUE`, [token]
    );
    if (!inv.rows.length) return res.status(404).json({ error: "Invitation not found or inactive" });
    const { instructor_id, instructor_name, course } = inv.rows[0];
    await pool.query(
      `INSERT INTO student_classes (student_id, instructor_id, course, status)
       VALUES ($1, $2, $3, 'pending') ON CONFLICT (student_id, instructor_id, course) DO NOTHING`,
      [user_id, instructor_id, course]
    );
    // Update users.instructor/course for backward compat if not already set
    await pool.query(
      `UPDATE users SET instructor = COALESCE(instructor, $1), course = COALESCE(course, $2) WHERE id = $3`,
      [instructor_name, course, user_id]
    );
    logActivity(user_id, "class_join_requested", { course, instructor_name, instructor_id, via: "invite link" });
    res.json({ ok: true, instructor_name, course });
  } catch (err) {
    console.error("Class join error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all classes for a student
app.get("/api/student/:id/classes", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sc.id, sc.course, sc.status, sc.enrolled_at,
              u.id AS instructor_id, u.full_name AS instructor_name
       FROM student_classes sc
       JOIN users u ON u.id = sc.instructor_id
       WHERE sc.student_id = $1
       ORDER BY sc.enrolled_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Student unenrolls from a class
app.delete("/api/student/:id/classes/:classId", async (req, res) => {
  try {
    const left = await pool.query(
      `DELETE FROM student_classes WHERE id = $1 AND student_id = $2 RETURNING course, instructor_id`,
      [req.params.classId, req.params.id]
    );
    if (left.rowCount) logActivity(req.params.id, "student_unenrolled", { course: left.rows[0].course, instructor_id: left.rows[0].instructor_id });
    // Clear users.instructor/course if no approved classes remain
    const remaining = await pool.query(
      `SELECT id FROM student_classes WHERE student_id = $1 AND status = 'approved' LIMIT 1`,
      [req.params.id]
    );
    if (!remaining.rows.length) {
      const firstClass = await pool.query(
        `SELECT sc.course, u.full_name AS instructor_name
         FROM student_classes sc JOIN users u ON u.id = sc.instructor_id
         WHERE sc.student_id = $1 ORDER BY sc.enrolled_at DESC LIMIT 1`,
        [req.params.id]
      );
      if (firstClass.rows.length) {
        await pool.query(`UPDATE users SET instructor = $1, course = $2 WHERE id = $3`,
          [firstClass.rows[0].instructor_name, firstClass.rows[0].course, req.params.id]);
      } else {
        await pool.query(`UPDATE users SET instructor = NULL, course = NULL WHERE id = $1`, [req.params.id]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Instructor: manual student management ─────────────────────────────────────
app.patch("/instructor/students/:studentId/remove", async (req, res) => {
  try {
    const { instructor_id } = req.body ?? {};
    if (instructor_id) {
      await pool.query(
        `DELETE FROM student_classes WHERE student_id = $1 AND instructor_id = $2`,
        [req.params.studentId, instructor_id]
      );
    } else {
      await pool.query(`UPDATE users SET instructor = NULL, course = NULL, approval_status = 'pending' WHERE id = $1`, [req.params.studentId]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/instructor/students/add", async (req, res) => {
  const { instructor_id, email } = req.body;
  if (!instructor_id || !email) return res.status(400).json({ error: "instructor_id and email required" });
  try {
    const ins = await pool.query(
      "SELECT id, full_name, course FROM users WHERE id = $1 AND is_instructor = TRUE",
      [instructor_id]
    );
    if (!ins.rows.length) return res.status(403).json({ error: "Instructor not found" });
    const { full_name: instructorName, course } = ins.rows[0];

    // Delete any previous pending invitation for the same instructor+email
    await pool.query(
      "DELETE FROM student_invitations WHERE instructor_id = $1 AND student_email = $2 AND status = 'pending'",
      [instructor_id, email.toLowerCase()]
    );

    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO student_invitations (instructor_id, student_email, course, token) VALUES ($1, $2, $3, $4)",
      [instructor_id, email.toLowerCase(), course || "Data Science", token]
    );

    if (EMAIL_READY) {
      await sendClassInvitationEmail(email, instructorName, course || "Data Science", token).catch((e) =>
        console.error("Invitation email error:", e.message)
      );
    }

    res.json({ invited: true, email });
  } catch (err) {
    console.error("Add student error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Accept a student invitation
app.get("/api/invitation/accept", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token required" });
  try {
    const inv = await pool.query(
      `SELECT si.*, u.full_name AS instructor_name
       FROM student_invitations si
       JOIN users u ON u.id = si.instructor_id
       WHERE si.token = $1 AND si.status = 'pending'`,
      [token]
    );
    if (!inv.rows.length) return res.status(404).json({ error: "Invitation not found or already used" });
    res.json(inv.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/invitation/accept", async (req, res) => {
  const { token, user_id } = req.body;
  if (!token || !user_id) return res.status(400).json({ error: "token and user_id required" });
  try {
    const inv = await pool.query(
      `SELECT si.*, u.full_name AS instructor_name
       FROM student_invitations si
       JOIN users u ON u.id = si.instructor_id
       WHERE si.token = $1 AND si.status = 'pending'`,
      [token]
    );
    if (!inv.rows.length) return res.status(404).json({ error: "Invitation not found or already used" });
    const { instructor_name, course } = inv.rows[0];

    const { instructor_id } = inv.rows[0];
    await pool.query(
      "UPDATE users SET instructor = $1, course = $2, approval_status = 'approved' WHERE id = $3",
      [instructor_name, course, user_id]
    );
    await pool.query(
      `INSERT INTO student_classes (student_id, instructor_id, course, status)
       VALUES ($1, $2, $3, 'approved') ON CONFLICT (student_id, instructor_id, course) DO UPDATE SET status = 'approved'`,
      [user_id, instructor_id, course]
    );
    await pool.query(
      "UPDATE student_invitations SET status = 'accepted' WHERE token = $1",
      [token]
    );
    logActivity(user_id, "class_join_requested", { course, instructor_name, instructor_id, via: "email invitation (auto-approved)" });

    res.json({ ok: true, instructor_name, course });
  } catch (err) {
    console.error("Accept invitation error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: class overview ──────────────────────────────────���──────────────────
app.get("/api/admin/classes", async (req, res) => {
  const { admin_id } = req.query;
  if (!admin_id) return res.status(401).json({ error: "Unauthorized" });
  try {
    const adminCheck = await pool.query("SELECT is_admin FROM users WHERE id = $1", [admin_id]);
    if (!adminCheck.rows[0]?.is_admin) return res.status(403).json({ error: "Forbidden" });

    const instructors = await pool.query(
      `SELECT id, COALESCE(first_name || ' ' || last_name, full_name) AS full_name, email
       FROM users WHERE is_instructor = TRUE ORDER BY full_name`
    );

    const result = await Promise.all(instructors.rows.map(async (ins) => {
      const students = await pool.query(
        `SELECT id, COALESCE(first_name || ' ' || last_name, full_name) AS full_name,
                email, course, approval_status, semester, created_at
         FROM users
         WHERE instructor = $1 AND is_instructor = FALSE AND is_admin = FALSE
         ORDER BY created_at DESC`,
        [ins.full_name]
      );
      return { ...ins, students: students.rows };
    }));

    res.json(result);
  } catch (err) {
    console.error("Admin classes error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/admin/classes/:instructorId/terminate", requireAdmin, async (req, res) => {
  const { semester } = req.body;
  try {
    const ins = await pool.query(
      "SELECT COALESCE(first_name || ' ' || last_name, full_name) AS full_name FROM users WHERE id = $1",
      [req.params.instructorId]
    );
    if (!ins.rows.length) return res.status(404).json({ error: "Instructor not found" });
    const instructorName = ins.rows[0].full_name;

    const updated = await pool.query(
      `UPDATE users
       SET approval_status = 'terminated', semester = COALESCE($1, semester)
       WHERE instructor = $2 AND is_instructor = FALSE AND is_admin = FALSE
         AND approval_status != 'terminated'
       RETURNING id`,
      [semester || null, instructorName]
    );
    res.json({ terminated: updated.rowCount });
  } catch (err) {
    console.error("Terminate class error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: instructor activity feed ──────────────────────────────────────────
app.get("/api/admin/activity", async (req, res) => {
  const { admin_id } = req.query;
  if (!admin_id) return res.status(401).json({ error: "Unauthorized" });
  try {
    const adminCheck = await pool.query("SELECT is_admin FROM users WHERE id = $1", [admin_id]);
    if (!adminCheck.rows[0]?.is_admin) return res.status(403).json({ error: "Forbidden" });

    const result = await pool.query(
      `SELECT al.*, COALESCE(u.first_name || ' ' || u.last_name, u.full_name) AS instructor_name, u.email AS instructor_email
       FROM activity_log al
       JOIN users u ON u.id = al.user_id
       WHERE u.is_instructor = TRUE
       ORDER BY al.created_at DESC
       LIMIT 300`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Admin activity error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Python generation service health monitor ──────────────────────────────────
// Pings the Python service every few minutes and logs only state CHANGES:
// ERROR when it goes down, INFO when it recovers, WARN when it is very slow.
const PYTHON_API_URL = (process.env.PYTHON_API_URL
  || (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production"
      ? "https://whysoserious1012-synthcs.hf.space" : "http://localhost:8000")).replace(/\/$/, "");
const pythonHealth = { up: null, downSince: null, lastSlowLog: 0 };

async function checkPythonHealth() {
  const started = Date.now();
  try {
    const r = await fetch(`${PYTHON_API_URL}/`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const duration_ms = Date.now() - started;
    if (pythonHealth.up === false) {
      logEvent({ action: "python_service_recovered", details: { url: PYTHON_API_URL, downtime_s: Math.round((Date.now() - pythonHealth.downSince) / 1000) } });
    }
    if (duration_ms > 10_000 && Date.now() - pythonHealth.lastSlowLog > 60 * 60 * 1000) {
      pythonHealth.lastSlowLog = Date.now();
      logEvent({ action: "python_service_slow", details: { url: PYTHON_API_URL, duration_ms } });
    }
    pythonHealth.up = true;
    pythonHealth.downSince = null;
  } catch (e) {
    if (pythonHealth.up !== false) {
      pythonHealth.downSince = Date.now();
      logEvent({ action: "python_service_down", details: { url: PYTHON_API_URL, error: e.message } });
    }
    pythonHealth.up = false;
  }
}

// Keep WARN/ERROR for a year, routine INFO for 180 days
async function applyLogRetention() {
  try {
    const r = await pool.query(
      `DELETE FROM activity_log
       WHERE (level = 'INFO' AND created_at < NOW() - INTERVAL '180 days')
          OR (level IN ('WARN','ERROR') AND created_at < NOW() - INTERVAL '365 days')`
    );
    if (r.rowCount > 0) logEvent({ action: "log_retention", details: { removed: r.rowCount } });
  } catch (e) {
    console.error("Log retention error:", e.message);
  }
}

initDB().then(() => {
  cleanupExpiredDatasets();
  setInterval(cleanupExpiredDatasets, 60 * 60 * 1000);
  applyLogRetention();
  setInterval(applyLogRetention, 24 * 60 * 60 * 1000);
  checkPythonHealth();
  setInterval(checkPythonHealth, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    logEvent({ action: "server_started", details: { port: Number(PORT), node: process.version } });
  });
});
