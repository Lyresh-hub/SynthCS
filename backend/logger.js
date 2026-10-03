// =============================================================================
// logger.js — structured activity & system logs (INFO / WARN / ERROR)
// =============================================================================
// Modelled on CloudWatch Logs / Grafana Loki:
//   - every entry is a structured event: level, category, action, actor, a
//     human-readable message, and context fields (details JSON)
//   - levels follow the usual severity ladder:
//       INFO  — normal activity             (student logged in, generated a dataset)
//       WARN  — potentially problematic but recoverable
//                                           (failed login, flagged prompt, AI fallback,
//                                            slow request, email not sent)
//       ERROR — an actual failure           (request crashed with a 500, generation failed,
//                                            Python service down, unhandled exception)
//   - system events have no user (user_id NULL)
//   - each event is ALSO printed as one JSON line to stdout, so the hosting
//     platform's log tooling (Railway / CloudWatch / Loki) can index it too
//
// The level and category of an action are decided HERE, from the catalog below —
// callers (including the browser) only say what happened, never how severe it is.
// =============================================================================

const LEVELS = ["INFO", "WARN", "ERROR"];

const s = (v) => (v === undefined || v === null || v === "" ? "" : String(v));
const q = (v, n = 90) => { const t = s(v).replace(/\s+/g, " ").trim(); return t.length > n ? `“${t.slice(0, n)}…”` : `“${t}”`; };
// "Training CTGAN · generating 5,000 rows…" → "while training CTGAN · generating 5,000 rows"
const step = (stage) => { const t = s(stage).replace(/[….]+$/, "").trim(); return t ? `while ${t.charAt(0).toLowerCase()}${t.slice(1)}` : ""; };
const rows = (n) => (n == null ? "" : ` (${Number(n).toLocaleString("en-US")} rows)`);

// action → { level, category, message(details) }
const CATALOG = {
  // ── Authentication ──
  login_success:            { level: "INFO",  category: "auth",       msg: (d) => `Logged in${d.method && d.method !== "password" ? ` with ${d.method}` : ""}` },
  login_failed:             { level: "WARN",  category: "auth",       msg: (d) => `Failed login for ${s(d.email) || "unknown account"} — ${s(d.reason) || "invalid credentials"}` },
  logout:                   { level: "INFO",  category: "auth",       msg: () => "Logged out" },
  banned_session_ended:     { level: "WARN",  category: "auth",       msg: () => "Banned account was signed out automatically" },
  strike_added:             { level: "WARN",  category: "auth",       msg: (d) => `Received strike ${d.strikes ?? "?"} of 3 (flagged prompt rejected${d.by_name ? ` by ${d.by_name}` : ""})` },
  account_banned:           { level: "WARN",  category: "auth",       msg: (d) => `Account banned${d.by === "admin" ? " by an administrator" : " automatically (3 strikes)"}${d.reason ? ` — ${d.reason}` : ""}` },
  account_unbanned:         { level: "INFO",  category: "auth",       msg: () => "Account unbanned by an administrator (strikes reset)" },
  strikes_reset:            { level: "INFO",  category: "auth",       msg: () => "Strikes removed by an administrator" },
  signup:                   { level: "INFO",  category: "auth",       msg: (d) => `Created an account${d.role ? ` (${d.role})` : ""}` },
  instructor_registered:    { level: "INFO",  category: "auth",       msg: () => "Instructor account registered by an administrator" },
  email_verified:           { level: "INFO",  category: "auth",       msg: () => "Verified email address" },
  password_reset_requested: { level: "INFO",  category: "auth",       msg: () => "Requested a password reset" },

  // ── Classes & enrollment ──
  class_join_requested:     { level: "INFO",  category: "class",      msg: (d) => `Requested to join ${s(d.course) || "a class"}` },
  student_approved:         { level: "INFO",  category: "class",      msg: (d) => `Approved ${s(d.student_name) || "a student"} into the class` },
  student_rejected:         { level: "INFO",  category: "class",      msg: (d) => `Rejected ${s(d.student_name) || "a student"}'s enrollment` },
  student_unenrolled:       { level: "INFO",  category: "class",      msg: (d) => `Left ${s(d.course) || "a class"}` },
  invite_created:           { level: "INFO",  category: "class",      msg: (d) => `Created an invite link for ${s(d.course)}` },
  restriction_added:        { level: "INFO",  category: "class",      msg: (d) => `Added class restriction: ${s(d.restriction_type)} “${s(d.value)}”${d.action ? ` (${d.action})` : ""}` },
  restriction_removed:      { level: "INFO",  category: "class",      msg: () => "Removed a class restriction" },
  student_invited:          { level: "INFO",  category: "class",      msg: (d) => `Invited ${s(d.email) || "a student"} to ${s(d.course) || "the class"} by email` },
  student_removed:          { level: "INFO",  category: "class",      msg: (d) => `Removed ${s(d.student_name) || "a student"} from ${s(d.course) || "the class"}` },
  invite_toggled:           { level: "INFO",  category: "class",      msg: (d) => `${d.active ? "Activated" : "Deactivated"} the invite link for ${s(d.course) || "a class"}` },
  invite_deleted:           { level: "INFO",  category: "class",      msg: (d) => `Deleted the invite link for ${s(d.course) || "a class"}` },
  restrictions_updated:     { level: "INFO",  category: "class",      msg: (d) => `Updated ${s(d.course) || "class"} limits${d.max_rows ? ` (max ${Number(d.max_rows).toLocaleString("en-US")} rows)` : ""}${Array.isArray(d.allowed_formats) && d.allowed_formats.length ? ` (formats: ${d.allowed_formats.join(", ")})` : ""}` },

  // ── Search ──
  dataset_search:           { level: "INFO",  category: "search",     msg: (d) => `Searched datasets for ${q(d.prompt_text)}` },
  ai_search:                { level: "INFO",  category: "search",     msg: (d) => `AI search: ${q(d.prompt_text)}` },
  search_no_results:        { level: "INFO",  category: "search",     msg: (d) => `No datasets found for ${q(d.prompt_text)}` },

  // ── Generation ──
  schema_generated:         { level: "INFO",  category: "generation", msg: (d) => `Generated a schema${d.table_name ? ` “${d.table_name}”` : ""} from ${q(d.prompt_text, 60)}` },
  schema_saved:             { level: "INFO",  category: "generation", msg: (d) => `Saved schema “${s(d.schema_name)}”` },
  dataset_generated:        { level: "INFO",  category: "generation", msg: (d) => `Generated dataset “${s(d.table_name)}”${rows(d.rows)}${d.source ? ` via ${d.source}` : ""}${d.locked ? " — locked pending review" : ""}` },
  generation_slow:          { level: "WARN",  category: "generation", msg: (d) => `Took ${Math.round((d.duration_ms ?? 0) / 60000)} min ${step(d.stage) || "to generate"}` },
  generation_failed:        { level: "ERROR", category: "generation", msg: (d) => `Failed ${step(d.stage) || "during generation"}: ${s(d.error).slice(0, 160) || "unknown error"}` },

  // ── Datasets ──
  dataset_uploaded:         { level: "INFO",  category: "dataset",    msg: (d) => `Uploaded ${s(d.file_name) || "a file"}${d.tables > 1 ? ` (${d.tables} tables detected)` : ""}` },
  dataset_upload_failed:    { level: "WARN",  category: "dataset",    msg: (d) => `Upload of ${s(d.file_name) || "a file"} failed: ${s(d.error).slice(0, 140)}` },
  dataset_previewed:        { level: "INFO",  category: "dataset",    msg: (d) => `Previewed “${s(d.table_name) || "dataset"}”` },
  dataset_exported:         { level: "INFO",  category: "dataset",    msg: (d) => `Exported “${s(d.table_name) || "dataset"}” as ${s(d.format).toUpperCase() || "a file"}` },
  dataset_downloaded:       { level: "INFO",  category: "dataset",    msg: (d) => `Downloaded “${s(d.table_name) || "dataset"}”${rows(d.rows)}` },
  dataset_deleted:          { level: "INFO",  category: "dataset",    msg: (d) => `Deleted dataset “${s(d.table_name) || "dataset"}”` },
  locked_dataset_access:    { level: "WARN",  category: "dataset",    msg: (d) => `Tried to open a dataset locked for review${d.review_status ? ` (${d.review_status})` : ""}` },
  export_failed:            { level: "ERROR", category: "dataset",    msg: (d) => `Export failed: ${s(d.error).slice(0, 160)}` },

  // ── Moderation & review ──
  prompt_flagged:           { level: "WARN",  category: "moderation", msg: (d) => `Prompt flagged for review: ${q(d.prompt_text, 70)}` },
  prompt_blocked:           { level: "WARN",  category: "moderation", msg: (d) => `Prompt blocked by class restriction (${(d.blocked_terms ?? []).join(", ")})` },
  prompt_resubmitted_rejected: { level: "WARN", category: "moderation", msg: (d) => `Resubmitted a prompt the instructor already rejected: ${q(d.prompt_text, 70)}` },
  quota_reached:            { level: "WARN",  category: "moderation", msg: (d) => `Hit the daily generation limit${d.limit ? ` (${d.limit})` : ""}` },
  prompt_approved:          { level: "INFO",  category: "moderation", msg: (d) => `Approved ${s(d.student_name) || "a student"}'s flagged prompt` },
  prompt_rejected:          { level: "INFO",  category: "moderation", msg: (d) => `Rejected ${s(d.student_name) || "a student"}'s flagged prompt` },
  ai_detection_unavailable: { level: "WARN",  category: "moderation", msg: (d) => `AI detection unavailable — rule-based fallback used${d.error ? ` (${s(d.error).slice(0, 100)})` : ""}` },

  // ── System ──
  server_started:           { level: "INFO",  category: "system",     msg: (d) => `Server started${d.port ? ` on port ${d.port}` : ""}` },
  http_error:               { level: "ERROR", category: "system",     msg: (d) => `${s(d.method)} ${s(d.route)} failed with ${s(d.status)}${d.error ? `: ${s(d.error).slice(0, 140)}` : ""}` },
  slow_request:             { level: "WARN",  category: "system",     msg: (d) => `${s(d.method)} ${s(d.route)} took ${Math.round((d.duration_ms ?? 0) / 1000)}s` },
  python_service_down:      { level: "ERROR", category: "system",     msg: (d) => `Generation service (Python) is unreachable${d.error ? `: ${s(d.error).slice(0, 120)}` : ""}` },
  python_service_slow:      { level: "WARN",  category: "system",     msg: (d) => `Generation service (Python) is responding slowly (${Math.round((d.duration_ms ?? 0) / 1000)}s)` },
  python_service_recovered: { level: "INFO",  category: "system",     msg: (d) => `Generation service (Python) is back online${d.downtime_s ? ` after ${Math.round(d.downtime_s / 60)} min` : ""}` },
  email_failed:             { level: "WARN",  category: "system",     msg: (d) => `${s(d.email_type) || "Email"} could not be sent: ${s(d.error).slice(0, 120)}` },
  unhandled_error:          { level: "ERROR", category: "system",     msg: (d) => `Unhandled ${s(d.kind) || "error"}: ${s(d.error).slice(0, 160)}` },
  log_retention:            { level: "INFO",  category: "system",     msg: (d) => `Log retention removed ${d.removed ?? 0} old INFO entries` },
};

// Actions the browser may report through POST /api/activity/log (severity is still decided here)
const CLIENT_ACTIONS = new Set([
  "logout", "search_no_results", "generation_slow", "generation_failed",
  "dataset_uploaded", "dataset_upload_failed", "dataset_previewed", "dataset_exported",
  "dataset_downloaded", "locked_dataset_access", "export_failed", "quota_reached",
]);

function describe(action, details = {}) {
  const entry = CATALOG[action];
  if (!entry) return { level: "INFO", category: "other", message: action.replace(/_/g, " ") };
  let message;
  try { message = entry.msg(details || {}); } catch { message = action.replace(/_/g, " "); }
  return { level: entry.level, category: entry.category, message };
}

function createLogger(pool) {
  async function logEvent({ action, userId = null, details = {}, level, category, message, source = "server" }) {
    const d = describe(action, details);
    const row = {
      level: LEVELS.includes(level) ? level : d.level,
      category: category || d.category,
      action,
      message: message || d.message,
      user_id: userId || null,
      source,
      details: details || {},
    };
    // One JSON line per event for the platform's log collector
    const line = JSON.stringify({ ts: new Date().toISOString(), ...row, details: undefined });
    (row.level === "ERROR" ? console.error : row.level === "WARN" ? console.warn : console.log)(`[log] ${line}`);
    try {
      await pool.query(
        `INSERT INTO activity_log (user_id, action_type, details, level, category, message, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.user_id, action, JSON.stringify(row.details), row.level, row.category, row.message, source]
      );
    } catch (e) {
      // Never let logging break the request; the stdout line above is still there
      process.stdout.write(`[log] failed to persist ${action}: ${e.message}\n`);
    }
  }

  return { logEvent };
}

module.exports = { createLogger, describe, CATALOG, CLIENT_ACTIONS, LEVELS };
