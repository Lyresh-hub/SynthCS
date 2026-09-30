// =============================================================================
// moderation.js — what exactly triggers a flag
// =============================================================================
// Every student prompt (search query or AI description, exactly as typed) goes
// through three detection levels. They ALL run, so the flag reason can list
// every level that fired:
//
//   Level 1 — Instructor trigger words   (per class, set in the Restrictions tab)
//             action "flag"  → prompt goes to the instructor for review
//             action "block" → prompt is refused outright
//             Checked against the PROMPT, and at generation time also against
//             the DATASET's column names.
//   Level 2 — AI detection               (Claude Haiku reads the prompt for intent)
//             Catches harmful requests that use no listed word. It can only ADD
//             a flag — it can never clear a Level 1 or Level 3 match.
//   Level 3 — System-level trigger words (built in, always on, cannot be removed)
//             Deterministic rules in this file. They run even when the AI is
//             down, times out, or misses the word — this is the fallback.
//
// Matching is done on a NORMALISED copy of the prompt so variations are caught:
//   case            "MANIPULATE"            → "manipulate"
//   word forms      "manipulating", "manipulation", "manipulated"
//   separators      "credit-card", "credit_card", "creditcard", "credit  card"
//   spaced letters  "c r e d i t card"      → "credit card"
//   look-alikes     "ph1shing", "fr@ud", "h4ck", "cr3dit"
//   accents         "frâud"                 → "fraud"
// =============================================================================

// ── Normalisation ────────────────────────────────────────────────────────────

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalize(text) {
  let s = String(text ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // strip accents
    .toLowerCase();
  // Look-alike characters only when they sit inside a word (ph1shing, fr@ud) — not in "top 10"
  s = s.replace(/(?<=[a-z])[013457@$!](?=[a-z0-9@$!]*[a-z])/g, (c) => LEET[c] ?? c);
  s = s.replace(/(?<![a-z0-9])[@$](?=[a-z])/g, (c) => LEET[c]);
  // Separators between letters become spaces: credit-card, credit_card, credit.card
  s = s.replace(/(?<=[a-z])[_\-./\\|*+~]+(?=[a-z])/g, " ");
  // Spaced-out letters: "c r e d i t" → "credit"
  s = s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
  return s.replace(/\s+/g, " ").trim();
}

// ── Level 3: system-level trigger words ──────────────────────────────────────
// Each rule: the word as shown to instructors, a category, what it matches,
// optional context that cancels it (only used for true homonyms), and sample
// variations that the test suite checks one by one.
// Patterns run against normalize(prompt); "\s*" between words also matches
// the words written together ("creditcard").

const SYSTEM_TRIGGERS = [
  // Financial / payment data
  { term: "credit card", category: "Financial data", pattern: /\bcredit\s*cards?\b|\bcc\s*(?:numbers?|nos?|num)\b/,
    examples: ["credit card", "credit cards", "Credit-Card", "creditcard", "credit_card numbers", "cr3dit card", "c r e d i t card", "CC number"] },
  { term: "cvv", category: "Financial data", pattern: /\bcv[vc]\d?\b/,
    examples: ["cvv", "CVV codes", "cvc", "cvv2"] },
  { term: "bank account number", category: "Financial data", pattern: /\bbank\s*account\s*(?:numbers?|nos?)\b|\brouting\s*numbers?\b/,
    examples: ["bank account number", "bank-account numbers", "routing number"] },
  { term: "fraud", category: "Fraud & deception", pattern: /\bfraud\w*/,
    examples: ["fraud", "frauds", "fraudulent", "fraudster", "FRAUD", "fr@ud"] },
  { term: "scam", category: "Fraud & deception", pattern: /\bscam(?:s|med|mer|mers|ming)?\b/,
    examples: ["scam", "scams", "scammer", "scamming", "SCAM"] },
  { term: "money laundering", category: "Fraud & deception", pattern: /\blaunder\w*/,
    examples: ["laundering", "launder money", "laundered", "money-laundering"] },
  { term: "counterfeit", category: "Fraud & deception", pattern: /\bcounterfeit\w*/,
    examples: ["counterfeit", "counterfeiting", "counterfeited"] },
  { term: "bribe", category: "Corruption", pattern: /\bbrib(?:e|es|ed|ing|ery|eries)\b/,
    examples: ["bribe", "bribes", "bribery", "bribing", "bribed"] },
  { term: "corrupt", category: "Corruption", pattern: /\bcorrupt\w*/,
    examples: ["corrupt", "corrupted", "corruption", "corrupting", "corruptible", "CORRUPT", "c0rrupt"] },
  { term: "embezzle", category: "Corruption", pattern: /\bembezzl\w*/,
    examples: ["embezzle", "embezzlement", "embezzling"] },

  // Falsification / academic integrity
  { term: "manipulate", category: "Manipulation & falsification", pattern: /\bmanipulat\w*/,
    examples: ["manipulate", "manipulates", "manipulated", "manipulating", "manipulation", "manipulative", "MANIPULATE", "man1pulate", "m a n i p u l a t e"] },
  { term: "falsify", category: "Manipulation & falsification", pattern: /\bfalsif\w*/,
    examples: ["falsify", "falsified", "falsifying", "falsification"] },
  { term: "fabricated results", category: "Manipulation & falsification",
    pattern: /\bfabricat\w*\s*(?:results?|data|records?|evidence|research|survey\w*|grades?|responses?|findings|documents?)\b/,
    examples: ["fabricated results", "fabricate data", "fabricating survey responses", "fabricated research"] },
  { term: "fake documents", category: "Manipulation & falsification",
    pattern: /\bfak(?:e|ed|ing)\s*(?:ids?|identif\w*|id\s*cards?|government\s*ids?|passports?|licen[cs]e\w*|transcripts?|diplomas?|certificates?|grades?|academic\s*records?|records?|documents?|receipts?|invoices?|reviews?|survey\s*results?|results?|signatures?|degrees?|accounts?)\b/,
    examples: ["fake ID", "fake ids", "fake transcript", "fake diploma", "fake survey results", "fake receipts", "faking grades"] },
  { term: "forgery", category: "Manipulation & falsification", pattern: /\bforg(?:e|ed|es|ery|eries|ing)\b/,
    examples: ["forged", "forgery", "forging signatures", "forge documents"] },
  { term: "cheat", category: "Academic integrity", pattern: /\bcheat(?:s|ed|er|ers|ing)?\b/,
    examples: ["cheat", "cheating", "cheated", "cheaters"] },
  { term: "plagiarism", category: "Academic integrity", pattern: /\bplagiari\w*/,
    examples: ["plagiarism", "plagiarize", "plagiarized"] },

  // Cyber attacks
  { term: "phishing", category: "Cyber attack", pattern: /\bphish\w*/,
    examples: ["phishing", "phish", "phished", "phisher", "PHISHING", "ph1shing", "phishing emails"] },
  { term: "fishing (phishing misspelling)", category: "Cyber attack", pattern: /\bfishing\b/,
    // Real fishing/fisheries prompts are left alone — unless they also talk about emails, links, logins, etc.
    exempt: /\b(?:fish|fishes|fisher(?:y|ies|man|men|folk)?|catch(?:es)?|boats?|vessels?|species|marine|aquacultur\w*|harvest\w*|tuna|bangus|milkfish|tilapia|bait|rods?|nets?|coastal|ocean|seas?|rivers?|lakes?|landings?|tonnage|municipal waters|fishing grounds?)\b/,
    unlessContext: /\b(?:e ?mails?|links?|urls?|sites?|websites?|attacks?|campaigns?|scams?|passwords?|credentials?|log ?ins?|accounts?|banks?|otps?|sms|texts?|messages?|victims?|clicks?|hack\w*)\b/,
    examples: ["fishing", "fishing emails", "fishing links", "fishing attack", "fishing scam", "fishing for passwords"] },
  { term: "hack", category: "Cyber attack", pattern: /\bhack(?:s|ed|er|ers|ing)?\b/,
    examples: ["hack", "hacking", "hacked", "hackers", "h4ck"] },
  { term: "exploit", category: "Cyber attack", pattern: /\bexploit\w*/,
    examples: ["exploit", "exploits", "exploiting", "exploitation"] },
  { term: "bypass", category: "Cyber attack", pattern: /\bbypass\w*/,
    examples: ["bypass", "bypassing", "bypassed"] },
  { term: "malware", category: "Cyber attack", pattern: /\b(?:malware|ransomware|spyware|keyloggers?|trojans?|botnets?|virus\s*payloads?)\b/,
    examples: ["malware", "ransomware", "spyware", "keylogger", "virus payload"] },
  { term: "password / credential dump", category: "Cyber attack",
    pattern: /\b(?:passwords?|credentials?)\s*(?:lists?|dumps?|leaks?|stuffing)\b|\bleaked\s*(?:data\w*|accounts?|passwords?|credentials?|records?|e ?mails?)\b/,
    examples: ["password list", "credential dump", "leaked passwords", "credential stuffing"] },

  // Theft / privacy
  { term: "stolen", category: "Theft & privacy", pattern: /\bstol(?:en|e)\b|\bsteal\w*/,
    examples: ["stolen", "stole", "steal", "stealing"] },
  { term: "identity theft", category: "Theft & privacy", pattern: /\bidentity\s*theft\b|\bimpersonat\w*/,
    examples: ["identity theft", "identity-theft", "impersonate", "impersonating"] },
  { term: "social security number", category: "Theft & privacy", pattern: /\bssns?\b|\bsocial\s*security\s*(?:numbers?|nos?)\b/,
    examples: ["ssn", "SSNs", "social security number"] },
  { term: "real personal data", category: "Theft & privacy",
    pattern: /\breal\s*(?:people|persons?|students?|customers?|patients?|employees?|users?|citizens?)(?:'s|')?\s*(?:names?|data|records?|info\w*|ids?|addresses?|phone\w*|e ?mails?|details)\b|\breal\s*(?:student|government)?\s*ids?\b|\breal\s*payroll\b/,
    examples: ["real student ids", "real customers' names", "real people data", "real payroll", "real government id"] },
  { term: "personal info of people you know", category: "Theft & privacy",
    pattern: /\b(?:my\s*)?(?:classmates?|schoolmates?|friends?|neighbou?rs?|teachers?|professors?|instructors?|co ?workers?|ex|crush|family)(?:'s|')?\s*(?:(?:real|actual|home|personal|private|mobile|cell)\s*)*(?:phone\s*(?:numbers?|nos?)|numbers|addresses?|e ?mails?|passwords?|locations?|birthdays?|salar(?:y|ies)|bank\s*details?|social\s*media\s*accounts?)\b/,
    examples: ["my classmates' home phone numbers", "classmates phone numbers", "teachers' home addresses", "my ex's location", "professor's personal email"] },
  { term: "tampering with grades / records", category: "Manipulation & falsification",
    pattern: /\btamper\w*|\b(?:chang|alter|edit|modif|adjust|inflat|boost)\w*\s*(?:(?:their|the|my|our|his|her|official|final|student|students'?)\s*)*(?:grades?|gpa|scores?|marks|transcripts?|official\s*records?|exam\s*results?)\b/,
    examples: ["tamper with records", "tampering", "changing grades", "alter the official records", "inflate my GPA", "boost students' scores"] },
  { term: "doxxing", category: "Theft & privacy", pattern: /\bdox(?:x|xing|xed|ing|ed)?\b/,
    examples: ["dox", "doxxing", "doxxed"] },
  { term: "personal address / phone list", category: "Theft & privacy",
    pattern: /\b(?:home|personal|residential)\s*address\w*\b|\bphone\s*numbers?\s*lists?\b|\bsalary\s*dump\b/,
    examples: ["home address list", "personal address", "phone number list", "employee salary dump"] },
  { term: "patient / medical records", category: "Theft & privacy", pattern: /\bpatient\s*records?\b|\bmedical\s*records?\s*with\s*names?\b/,
    examples: ["patient record", "patient records", "medical record with name"] },

  // Violence / illegal activity
  { term: "illegal", category: "Illegal activity", pattern: /\billegal\w*/,
    examples: ["illegal", "illegally"] },
  { term: "weapon", category: "Illegal activity", pattern: /\bweapon\w*|\bbomb\s*making\b|\bexplosives?\b/,
    examples: ["weapon", "weapons", "bomb making", "explosives"] },
  { term: "drugs", category: "Illegal activity", pattern: /\bnarcotic\w*|\bdrug\s*(?:synthesis|trafficking|dealing)\b/,
    examples: ["narcotics", "drug synthesis", "drug trafficking"] },
  { term: "terrorism", category: "Illegal activity", pattern: /\bterroris\w*/,
    examples: ["terrorism", "terrorist"] },
  { term: "child abuse", category: "Illegal activity", pattern: /\bchild\s*abuse\b|\bminors?\s*exploit\w*/,
    examples: ["child abuse", "minor exploitation"] },
  { term: "harassment", category: "Illegal activity", pattern: /\bharass\w*/,
    examples: ["harass", "harassment", "harassing"] },

  // Harmful-intent phrasing — catches intent even when no other word is listed
  { term: "evade detection", category: "Harmful intent",
    pattern: /\bwithout\s*(?:being\s*|getting\s*)?(?:detected|detection|caught|noticed|consent|permission)\b|\bundetect\w*|\bevad(?:e|es|ed|ing)\b|\bevasion\b/,
    examples: ["without being detected", "without consent", "undetectable", "evade audits", "tax evasion"] },
  { term: "deceive", category: "Harmful intent", pattern: /\bdeceiv\w*|\bdeception\b|\bmislead\w*/,
    examples: ["deceive", "deceiving", "mislead", "misleading"] },
];

// ── Level 1: instructor trigger words → forgiving pattern ────────────────────
// "manipulate" also catches manipulating/manipulation; multi-word terms allow
// any separator or none ("credit card" ↔ "credit-card" ↔ "creditcard").
function stemPattern(word) {
  const w = normalize(word).replace(/[^a-z0-9]/g, "");
  if (!w) return null;
  const stem = w.length > 4 ? w.replace(/(?:e|es|s|ed|ing)$/, "") : w;
  return stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function customTermRegex(value) {
  const parts = normalize(value).split(" ").map(stemPattern).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`\\b${parts.join("\\w*\\s*")}\\w*`);
}

// ── Detection (Levels 1 + 3) ─────────────────────────────────────────────────

function findSystemMatches(normText) {
  const out = [];
  for (const rule of SYSTEM_TRIGGERS) {
    const m = normText.match(rule.pattern);
    if (!m) continue;
    const exempted = rule.exempt && rule.exempt.test(normText) && !(rule.unlessContext && rule.unlessContext.test(normText));
    out.push({
      level: 3, source: "System-level trigger word", term: rule.term, category: rule.category,
      matched: m[0], action: exempted ? "exempt" : "flag",
      ...(exempted ? { note: "Word appears in an ordinary (non-cyber) context, so it was not flagged" } : {}),
    });
  }
  return out;
}

function findCustomMatches(normText, restrictions, where) {
  const out = [];
  for (const r of restrictions ?? []) {
    if (r.restriction_type !== "keyword") continue;
    const re = customTermRegex(r.value);
    const m = re && normText.match(re);
    if (m) {
      out.push({
        level: 1, source: `Instructor trigger word (${where})`, term: r.value, category: "Class restriction",
        matched: m[0], action: r.action === "block" ? "block" : "flag",
      });
    }
  }
  return out;
}

/**
 * Rule-based detection on the raw prompt (and optionally the dataset's column names).
 * Returns { normalized, matches } — AI (Level 2) is added separately by the server.
 */
function detect(prompt, { restrictions = [], fieldNames = [] } = {}) {
  const normPrompt = normalize(prompt);
  const matches = [
    ...findSystemMatches(normPrompt),
    ...findCustomMatches(normPrompt, restrictions, "in prompt"),
  ];
  if (fieldNames.length) {
    const normFields = normalize(fieldNames.join(" "));
    for (const m of findCustomMatches(normFields, restrictions, "in dataset columns")) {
      if (!matches.some((x) => x.level === 1 && x.term === m.term)) matches.push(m);
    }
  }
  return { normalized: normPrompt, matches };
}

// ── Level 2: AI detection ────────────────────────────────────────────────────
// Level 2 — AI detection. Returns { status: "safe" | "unsafe" | "unavailable", reason? }
async function aiDetect(prompt, apiKey) {
  const Anthropic = require("@anthropic-ai/sdk");
  if (!apiKey) return { status: "unavailable", reason: "No AI key configured" };
  try {
    const client = new Anthropic({ apiKey, timeout: 10_000, maxRetries: 1 });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 160,
      messages: [{
        role: "user",
        content: `You are a content moderator for an academic synthetic data generator used by college students.
Classify the student's prompt below as SAFE or UNSAFE. Read the prompt itself for intent — do not rely on a word list.

UNSAFE means the request is for: real personal data about real people; fraud, scams, phishing, identity theft;
payment card or bank data meant for misuse; manipulating, falsifying, or fabricating results, grades, records, or evidence;
corruption or bribery; fake IDs, transcripts, or documents; hacking, malware, or bypassing security; weapons, drugs, terrorism;
or anything designed to harm, harass, cheat, or deceive. Treat misspellings and disguised words the same as the real word
(e.g. "fishing emails" meaning phishing, "cr3dit card").

Ordinary academic datasets (healthcare, finance, education, retail, sales, HR, research) with made-up records are SAFE.

Respond with ONLY valid JSON: {"safe": true} or {"safe": false, "reason": "one short sentence", "category": "short label"}

Prompt: ${prompt}`,
      }],
    });
    const raw = msg.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const c = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (c.safe === false) return { status: "unsafe", reason: c.reason || "Flagged by AI detection", category: c.category ?? null };
    return { status: "safe" };
  } catch (e) {
    console.error("AI detection error (rule-based fallback in effect):", e.message);
    return { status: "unavailable", reason: e.message };
  }
}

// ── Final decision + human-readable reason ───────────────────────────────────

function decide(matches, ai) {
  const active = matches.filter((m) => m.action !== "exempt");
  const blocked = active.filter((m) => m.action === "block");
  const aiFlag = ai?.status === "unsafe";
  const shouldFlag = active.length > 0 || aiFlag;

  const parts = [];
  for (const lvl of [3, 1]) {
    const hits = active.filter((m) => m.level === lvl);
    if (hits.length) {
      const label = lvl === 3 ? "Level 3 system trigger word" : "Level 1 instructor trigger word";
      parts.push(`${label}${hits.length > 1 ? "s" : ""}: ${hits.map((h) => `"${h.term}" (matched "${h.matched}")`).join(", ")}`);
    }
  }
  if (aiFlag) parts.push(`Level 2 AI detection: ${ai.reason}`);
  if (ai?.status === "unavailable" && active.length) parts.push("AI detection unavailable — flagged by rule-based fallback");

  return {
    flag: shouldFlag,
    block: blocked.length > 0,
    reason: parts.join(" · ") || null,
    blocked_terms: blocked.map((m) => m.term),
  };
}

module.exports = { normalize, detect, decide, aiDetect, customTermRegex, SYSTEM_TRIGGERS };
