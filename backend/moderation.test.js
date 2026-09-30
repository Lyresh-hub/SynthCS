// =============================================================================
// moderation.test.js — tests every trigger word individually, with variations
// =============================================================================
// Run:  node backend/moderation.test.js            (prints results, exit 1 on failure)
//       node backend/moderation.test.js --report   (also writes docs/flagging-test-report.md)
//
// For every Level 3 system trigger word, each listed variation is tested:
//   1. on its own                          "manipulating"
//   2. inside a realistic prompt           "a dataset of students manipulating grades"
//   3. in UPPERCASE inside the prompt
// Then Level 1 instructor words, the AI fallback, and a set of ordinary
// prompts that must NOT be flagged (false-positive guard).
// =============================================================================

const fs = require("fs");
const path = require("path");
const { detect, decide, SYSTEM_TRIGGERS } = require("./moderation");

const results = [];
function check(group, input, expectFlag, opts = {}, ai = null) {
  const { matches } = detect(input, opts);
  const d = decide(matches, ai);
  const pass = d.flag === expectFlag && (opts.expectBlock === undefined || d.block === opts.expectBlock);
  results.push({ group, input, expected: expectFlag ? "flag" : "not flagged", got: d.block ? "block" : d.flag ? "flag" : "not flagged", reason: d.reason ?? matches.filter((m) => m.action === "exempt").map((m) => `exempt: ${m.term}`).join(", "), pass });
}

// ── Level 3: every system trigger word, every variation ──────────────────────
const TEMPLATES = [
  (v) => v,
  (v) => `Generate a dataset of 500 records about ${v} for my class project`,
  (v) => `make me a TABLE WITH ${v.toUpperCase()} INCLUDED`,
];
for (const rule of SYSTEM_TRIGGERS) {
  for (const v of rule.examples) {
    for (const t of TEMPLATES) check(`L3 · ${rule.term}`, t(v), true);
  }
}

// Reviewer's examples, in several phrasings
const REVIEWER = [
  "corrupt", "Corrupt officials bribery records", "dataset on corruption in the barangay", "corrupted government transactions",
  "manipulate", "how to manipulate survey results", "stock price manipulation dataset", "students who manipulated their grades",
  "fishing", "fishing emails targeting students", "fishing link click logs", "fishing attack dataset",
  "credit card", "credit card transactions", "Credit-Card numbers with expiry", "creditcard dataset", "customers and their credit cards",
];
for (const p of REVIEWER) check("Reviewer examples", p, true);

// ── Level 1: instructor trigger words (flag / block) with variations ─────────
const CLASS_RULES = [
  { restriction_type: "keyword", value: "gambling", action: "flag" },
  { restriction_type: "keyword", value: "exam answers", action: "block" },
];
for (const p of ["gambling", "online GAMBLING sites", "gamble-related bets"]) check("L1 · gambling (flag)", p, true, { restrictions: CLASS_RULES });
for (const p of ["exam answers", "leak the Exam-Answers", "examanswers key"]) check("L1 · exam answers (block)", p, true, { restrictions: CLASS_RULES, expectBlock: true });
check("L1 · dataset columns", "student performance data", true, { restrictions: CLASS_RULES, fieldNames: ["student_id", "gambling_losses"] });

// ── Level 2 fallback: AI unavailable → rules still flag; AI adds flags ───────
check("L2 · AI down, rule fallback", "phishing email dataset", true, {}, { status: "unavailable" });
check("L2 · AI catches unlisted intent", "list of my classmates' home phone numbers", true, {}, { status: "unsafe", reason: "Requests personal data of real people" });
check("L2 · AI says safe, rule still flags", "credit card transactions", true, {}, { status: "safe" });

// ── Must NOT be flagged (false-positive guard) ───────────────────────────────
const SAFE = [
  "student grades and attendance for a statistics class",
  "fishing boat catch landings by species in Bataan",
  "municipal fisheries data: fishing vessels, tonnage, and catch per month",
  "hackathon registrations with team names and scores",
  "cheatsheet usage survey of CS students",
  "e-commerce orders with product, quantity and price",
  "hospital appointments with doctor and department",
  "top 10 products sold in 2023",
  "scampi and seafood restaurant menu sales",
  "employee leave requests and approvals",
  "customer phone numbers and addresses for a delivery app",
  "exam scores and final grades per student",
  "teacher workload and number of classes handled",
  "grade distribution changes across semesters",
];
for (const p of SAFE) check("Safe prompts (must not flag)", p, false);

// ── Output ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
const groups = [...new Set(results.map((r) => r.group))];
console.log(`\n${results.length} checks · ${results.length - failed.length} passed · ${failed.length} failed\n`);
for (const f of failed) console.log(`FAIL [${f.group}] "${f.input}" → expected ${f.expected}, got ${f.got}`);

if (process.argv.includes("--report")) {
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
  const lines = [
    "# Flagging Test Report",
    "",
    `Generated by \`node backend/moderation.test.js --report\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    `**${results.length} checks · ${results.length - failed.length} passed · ${failed.length} failed**`,
    "",
    "Each Level 3 system trigger word is tested with every listed variation, three ways: the word alone, inside a realistic prompt, and in uppercase inside a prompt.",
    "",
    "## Summary by trigger",
    "",
    "| Trigger / group | Checks | Passed |",
    "|---|---:|---:|",
    ...groups.map((g) => {
      const rs = results.filter((r) => r.group === g);
      return `| ${esc(g)} | ${rs.length} | ${rs.filter((r) => r.pass).length} |`;
    }),
    "",
    "## Every check",
    "",
    "| Group | Prompt tested | Expected | Result | What triggered it |",
    "|---|---|---|---|---|",
    ...results.map((r) => `| ${esc(r.group)} | ${esc(r.input)} | ${r.expected} | ${r.pass ? "✅" : "❌"} ${r.got} | ${esc(r.reason) || "—"} |`),
    "",
  ];
  const out = path.join(__dirname, "..", "docs", "flagging-test-report.md");
  fs.writeFileSync(out, lines.join("\n"));
  console.log(`Report written to ${path.relative(process.cwd(), out)}`);
}

process.exit(failed.length ? 1 : 0);
