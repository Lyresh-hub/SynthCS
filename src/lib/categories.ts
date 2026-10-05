// ── Dataset categories ───────────────────────────────────────────────────────
// ONE list, used by both sides:
//   • the instructor's "Allowed categories" restriction (Instructor Dashboard)
//   • the student's "What type of data is this?" step (Schema Builder)
// so a category an instructor allows is exactly a category the student can pick.
// Keywords power the "Auto" suggestion from the student's own words.

export const CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: "Healthcare / Medical",     keywords: ["patient","hospital","doctor","medical","disease","health","diagnosis","treatment","prescription","nurse","clinic","medication","symptom","surgery","pharmacy"] },
  { label: "Finance / Banking",        keywords: ["bank","loan","credit","payment","transaction","fraud","account","balance","interest","mortgage","insurance","invest","stock","financial","money","billing"] },
  { label: "Education / Academic",     keywords: ["student","grade","school","course","teacher","exam","enrollment","university","college","score","class","lecture","academic","professor","curriculum"] },
  { label: "E-commerce / Retail",      keywords: ["product","order","customer","purchase","inventory","price","cart","sale","retail","store","shop","item","vendor","marketplace"] },
  { label: "Technology / IT",          keywords: ["software","server","network","user","system","app","database","code","device","error","log","api","web","tech","computer","bug","deploy"] },
  { label: "Government / Public",      keywords: ["citizen","government","policy","tax","vote","election","permit","license","public","municipal","regulation","census"] },
  { label: "Business / HR",            keywords: ["employee","salary","department","performance","hire","payroll","company","manager","staff","workforce","job","position","leave","attendance"] },
  { label: "Logistics / Supply Chain", keywords: ["shipping","shipment","delivery","warehouse","logistics","supply","freight","courier","fleet","route","truck","cargo","supplier","tracking"] },
  { label: "Research / Science",       keywords: ["experiment","sample","observation","measurement","study","analysis","lab","research","hypothesis","scientific","survey","variable"] },
  { label: "Other",                    keywords: [] },
];

export const CATEGORY_LABELS = CATEGORIES.map((c) => c.label);

// Older instructor restrictions were saved with different names — map them to the current list
const OLD_NAMES: Record<string, string> = {
  "E-Commerce / Retail":         "E-commerce / Retail",
  "Human Resources":             "Business / HR",
  "Technology / Software":       "Technology / IT",
  "Government / Public Records": "Government / Public",
};

export function normalizeCategory(label: string): string {
  return OLD_NAMES[label] ?? label;
}
