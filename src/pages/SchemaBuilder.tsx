import { useState, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import { pushNotification } from "../lib/notifications";
import {
  Plus, Trash2, GripVertical, Layers, X,
  Search, Download, RefreshCw, AlertCircle, Save, ChevronDown, ChevronRight, Sparkles, Upload,
} from "lucide-react";
import GeneratingLoader from "../components/GeneratingLoader";

import { NODE_API, PYTHON_API } from "../lib/config";

/** Parse an error response from the Python backend.
 *  HF Spaces returns an HTML 500 page when the container crashes — detect that
 *  and return a friendly message instead of dumping raw HTML to the user. */
const _SERVER_UNAVAIL = "The generation server is temporarily unavailable. It may be starting up — please wait 30 seconds and try again.";

function _isHfWakeupResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("text/html") || res.status === 502 || res.status === 503 || res.status === 504;
}

async function _isServiceCrash(res: Response): Promise<boolean> {
  // Railway/HF can return a plain 500 when the container OOM-crashes and restarts.
  // Distinguish this from a real application 500 (which has a specific detail message)
  // by checking if the body is exactly FastAPI's unhandled-exception payload.
  if (res.status !== 500) return false;
  try {
    const text = await res.clone().text();
    const detail = JSON.parse(text)?.detail ?? "";
    return detail === "Internal Server Error";
  } catch {
    return true; // unparseable 500 → treat as crash
  }
}

/** Fetch a Python API endpoint, auto-retrying once if the HF Space is waking up. */
async function fetchPython(
  url: string,
  init: RequestInit,
  onWakeup?: (msg: string) => void,
): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  const SLEEP_MS = 30_000;
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    const isWakeup = _isHfWakeupResponse(res);
    const isCrash  = !isWakeup && await _isServiceCrash(res);
    if (!isWakeup && !isCrash) return res;
    lastRes = res;
    if (attempt < MAX_ATTEMPTS - 1) {
      onWakeup?.(`Server is starting up… retrying in 30 s (attempt ${attempt + 1}/${MAX_ATTEMPTS - 1})`);
      await new Promise<void>((resolve, reject) => {
        const id = setTimeout(resolve, SLEEP_MS);
        const signal = (init as any).signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Aborted", "AbortError")); });
      });
    }
  }
  return lastRes!;
}

async function parsePythonError(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") || res.status === 502 || res.status === 503 || res.status === 504) {
    return _SERVER_UNAVAIL;
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
    return _SERVER_UNAVAIL;
  }
  try { return JSON.parse(text)?.detail ?? text; } catch { return text; }
}

function sanitizeErrorMsg(msg: string): string {
  if (msg.trimStart().startsWith("<") || msg.includes("<!DOCTYPE") || msg.includes("<html")) {
    return _SERVER_UNAVAIL;
  }
  return msg;
}

const FIELD_TYPES = [
  "string", "integer", "float", "boolean",
  "date", "email", "uuid", "phone", "address", "name", "ip", "id",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldConstraints {
  min_val?:      number;
  max_val?:      number;
  distribution?: "uniform" | "normal" | "skewed";
  enum_values?:  string;    // comma-separated in the UI; sent as array to API
  cardinality?:  number;
  date_from?:    string;
  date_to?:      string;
  true_ratio?:   number;    // 0–1
  // Prefixed sequential ID
  id_prefix?:    string;    // e.g. "L" → L-0001, L-0002
  id_pad?:       number;    // zero-padding width, default 4
  // Conditional field
  condition?:             string;
  condition_true_value?:  string;
  condition_false_value?: string;
  condition_true_prob?:   number;
  condition_false_prob?:  number;
}

interface Field {
  id:           string;
  name:         string;
  type:         string;
  null_rate:    number;     // 0–50 %
  originalName: string;
  originalType: string;
  constraints:  FieldConstraints;
  description:  string;
  expanded:     boolean;
  llmGenerated?: boolean;   // auto-added by augment-schema → yellow
  mergedFrom?:   string;    // source label of dataset that contributed this field → blue
  fk_table?:     string;    // FK: referenced table name
  fk_field?:     string;    // FK: referenced field name
}

interface SmartResult extends KaggleDataset {
  source:      string;
  sourceLabel: string;
  sourceIcon:  string;
}

// Per-source color tokens (used for tabs, badges, and search result cards)
const SOURCE_COLORS: Record<string, { dot: string; badge: string; text: string; activeBg: string; activeText: string }> = {
  kaggle:      { dot: "bg-amber-500",   badge: "bg-amber-50 border-amber-200",   text: "text-amber-700",   activeBg: "bg-amber-500",   activeText: "text-white" },
  huggingface: { dot: "bg-yellow-500",  badge: "bg-yellow-50 border-yellow-200", text: "text-yellow-700",  activeBg: "bg-yellow-500",  activeText: "text-white" },
  uci:         { dot: "bg-blue-500",    badge: "bg-blue-50 border-blue-200",     text: "text-blue-700",    activeBg: "bg-blue-500",    activeText: "text-white" },
  openml:      { dot: "bg-emerald-500", badge: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", activeBg: "bg-emerald-500", activeText: "text-white" },
  datagov_ph:  { dot: "bg-red-500",     badge: "bg-red-50 border-red-200",       text: "text-red-700",     activeBg: "bg-red-500",     activeText: "text-white" },
  psa:         { dot: "bg-violet-500",  badge: "bg-violet-50 border-violet-200", text: "text-violet-700",  activeBg: "bg-violet-500",  activeText: "text-white" },
};

interface Table { id: string; name: string; fields: Field[]; rowCount?: number; }


interface KaggleDataset {
  ref: string; title: string; size: string;
  lastUpdated: string; downloadCount: number; description: string;
}

interface OriginalField {
  name: string; type: string; nullable: boolean; sample_values?: string[];
}

type Phase = "idle" | "results" | "loading" | "schema" | "template_preview" | "generating" | "error"
           | "smart_searching" | "smart_results" | "smart_augmenting" | "multi_preview";
type Mode  = "kaggle" | "llm";

// ── Generation modes ──────────────────────────────────────────────────────────

type PresetField = { name: string; type: string; description: string; constraints?: Partial<FieldConstraints> };
interface Preset { name: string; table: string; fields: PresetField[] }

type MultiPresetField = PresetField & { fk_table?: string; fk_field?: string };
interface MultiPresetTable { name: string; rowCount: number; fields: MultiPresetField[] }
interface MultiTablePreset { name: string; description: string; tables: MultiPresetTable[] }

const MULTI_TABLE_PRESETS: MultiTablePreset[] = [
  {
    name: "Gift Shop E-Commerce (Olongapo)",
    description: "4 tables: users · products · orders · deliveries with FK links",
    tables: [
      {
        name: "users", rowCount: 80,
        fields: [
          { name: "user_id",             type: "uuid",    description: "Primary key — unique customer ID" },
          { name: "full_name",           type: "name",    description: "Filipino customer full name" },
          { name: "age_group",           type: "string",  description: "Age bracket — one of 18-25, 26-35, 36-50",         constraints: { enum_values: "18-25, 26-35, 36-50" } },
          { name: "gender",              type: "string",  description: "Gender — M or F",                                  constraints: { enum_values: "M, F" } },
          { name: "barangay",            type: "string",  description: "Barangay in Olongapo — one of East Tapinac, West Tapinac, Sta. Rita, New Cabalan, Kalaklan, Pag-asa, Gordon Heights, Barretto, Mabayuan", constraints: { enum_values: "East Tapinac, West Tapinac, Sta. Rita, New Cabalan, Kalaklan, Pag-asa, Gordon Heights, Barretto, Mabayuan" } },
          { name: "budget_range",        type: "string",  description: "Spending level — one of Low, Mid, High",           constraints: { enum_values: "Low, Mid, High" } },
          { name: "preferred_occasions", type: "string",  description: "Shopping occasion — one of Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary", constraints: { enum_values: "Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary" } },
          { name: "lat",                 type: "float",   description: "Latitude within Olongapo City",                    constraints: { min_val: 14.80, max_val: 14.85 } },
          { name: "lng",                 type: "float",   description: "Longitude within Olongapo City",                   constraints: { min_val: 120.26, max_val: 120.30 } },
          { name: "created_at",          type: "date",    description: "Account creation date",                            constraints: { date_from: "2022-01-01", date_to: "2024-12-31" } },
        ],
      },
      {
        name: "products", rowCount: 100,
        fields: [
          { name: "product_id",       type: "uuid",    description: "Primary key — unique product ID" },
          { name: "name",             type: "string",  description: "Name of the gift or hamper product from an Olongapo shop" },
          { name: "category",         type: "string",  description: "Product type — one of food, hamper, craft",           constraints: { enum_values: "food, hamper, craft" } },
          { name: "price",            type: "float",   description: "Price in Philippine pesos",                           constraints: { min_val: 150, max_val: 3500 } },
          { name: "occasion_tags",    type: "string",  description: "Occasions this suits — one of Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary", constraints: { enum_values: "Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary" } },
          { name: "recipient_tags",   type: "string",  description: "Who it is for — one of parent, friend, partner, sibling, colleague", constraints: { enum_values: "parent, friend, partner, sibling, colleague" } },
          { name: "local_vendor",     type: "boolean", description: "True if from a local Olongapo vendor",                constraints: { true_ratio: 0.7 } },
          { name: "avg_rating",       type: "float",   description: "Average customer rating from 1.0 to 5.0",             constraints: { min_val: 1.0, max_val: 5.0 } },
          { name: "stock",            type: "integer", description: "Units currently available",                           constraints: { min_val: 0, max_val: 200 } },
          { name: "vendor_name",      type: "string",  description: "Name of the Olongapo vendor supplying this product" },
          { name: "weight_score",     type: "float",   description: "AI recommendation relevance score from 0.0 to 1.0",  constraints: { min_val: 0.0, max_val: 1.0 } },
        ],
      },
      {
        name: "orders", rowCount: 800,
        fields: [
          { name: "order_id",       type: "uuid",    description: "Primary key — unique order ID" },
          { name: "user_id",        type: "uuid",    description: "FK — customer who placed the order",   fk_table: "users",    fk_field: "user_id" },
          { name: "product_id",     type: "uuid",    description: "FK — product that was ordered",        fk_table: "products", fk_field: "product_id" },
          { name: "occasion",       type: "string",  description: "Occasion for the order — one of Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary", constraints: { enum_values: "Birthday, Fiesta, Christmas, New Year, Valentine's Day, Graduation, Anniversary" } },
          { name: "recipient_type", type: "string",  description: "Who the gift is for — one of parent, friend, partner, sibling, colleague", constraints: { enum_values: "parent, friend, partner, sibling, colleague" } },
          { name: "rating",         type: "integer", description: "Customer rating after delivery from 1 to 5", constraints: { min_val: 1, max_val: 5 } },
          { name: "order_date",     type: "date",    description: "Date the order was placed — last 12 months", constraints: { date_from: "2024-01-01", date_to: "2024-12-31" } },
          { name: "total_price",    type: "float",   description: "Total amount paid in Philippine pesos",  constraints: { min_val: 150, max_val: 3500 } },
          { name: "status",         type: "string",  description: "Order status — always completed",        constraints: { enum_values: "completed" } },
        ],
      },
      {
        name: "deliveries", rowCount: 300,
        fields: [
          { name: "delivery_id",  type: "uuid",    description: "Primary key — unique delivery ID" },
          { name: "order_id",     type: "uuid",    description: "FK — order this delivery is for",          fk_table: "orders", fk_field: "order_id" },
          { name: "rider_id",     type: "integer", description: "Rider assigned, one of 8 riders",          constraints: { min_val: 1, max_val: 8 } },
          { name: "barangay",     type: "string",  description: "Delivery barangay in Olongapo — one of East Tapinac, West Tapinac, Sta. Rita, New Cabalan, Kalaklan, Pag-asa, Gordon Heights, Barretto, Mabayuan", constraints: { enum_values: "East Tapinac, West Tapinac, Sta. Rita, New Cabalan, Kalaklan, Pag-asa, Gordon Heights, Barretto, Mabayuan" } },
          { name: "lat",          type: "float",   description: "Delivery latitude within Olongapo",        constraints: { min_val: 14.80, max_val: 14.85 } },
          { name: "lng",          type: "float",   description: "Delivery longitude within Olongapo",       constraints: { min_val: 120.26, max_val: 120.30 } },
          { name: "time_slot",    type: "string",  description: "Delivery time window — one of Morning, PM, Eve", constraints: { enum_values: "Morning, PM, Eve" } },
          { name: "distance_km",  type: "float",   description: "Distance traveled in km from 0.5 to 8.0", constraints: { min_val: 0.5, max_val: 8.0 } },
          { name: "assigned_at",  type: "date",    description: "When the delivery was assigned to a rider", constraints: { date_from: "2024-01-01", date_to: "2024-12-31" } },
          { name: "status",       type: "string",  description: "Delivery status — always delivered",        constraints: { enum_values: "delivered" } },
        ],
      },
    ],
  },
];


// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyConstraints(): FieldConstraints { return {}; }

function makeField(overrides: Partial<Field> & { name: string; type: string }): Field {
  return {
    id: Date.now().toString() + Math.random(),
    null_rate: 0,
    originalName: overrides.name,
    originalType: overrides.type,
    constraints: emptyConstraints(),
    description: "",
    expanded: false,
    ...overrides,
  };
}

// ── Entity auto-detection: split a flat LLM schema into related tables ────────

function _pluralizeEntity(word: string): string {
  if (word.endsWith("y") && word.length > 1 && !"aeiou".includes(word[word.length - 2])) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch") || word.endsWith("sh")) {
    return word + "es";
  }
  return word + "s";
}

/**
 * Given a flat list of fields (as the LLM produces), detect entity groups and
 * split them into separate Table objects.
 *
 * Detection rule: a prefix (part before the first `_`) is an entity group if it
 * has a `<prefix>_id` field AND at least one more field with that prefix.
 * e.g.  student_id + student_name + student_email  →  `students` table
 *        professor_id + professor_name              →  `professors` table
 *
 * The main table keeps only the `<prefix>_id` FK fields (with fk_table set)
 * plus all non-entity fields.
 */
function splitSchemaIntoTables(mainName: string, fields: Field[]): Table[] {
  // Group fields by prefix (text before first underscore)
  const groups: Record<string, Field[]> = {};
  for (const f of fields) {
    const idx = f.name.indexOf("_");
    if (idx > 0) {
      const prefix = f.name.slice(0, idx);
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(f);
    }
  }

  // Keep only groups that have an _id field AND at least one more field
  type EGroup = { idField: Field; others: Field[] };
  const entityGroups: Record<string, EGroup> = {};
  for (const [prefix, grp] of Object.entries(groups)) {
    const idField = grp.find((f) => f.name === `${prefix}_id`);
    const others  = grp.filter((f) => f.name !== `${prefix}_id`);
    if (idField && others.length >= 1) {
      entityGroups[prefix] = { idField, others };
    }
  }

  if (Object.keys(entityGroups).length === 0) {
    return [{ id: "t1", name: mainName, fields }];
  }

  const entityFieldNames = new Set<string>(
    Object.values(entityGroups).flatMap(({ idField, others }) => [
      idField.name,
      ...others.map((f) => f.name),
    ])
  );

  // Main table: keep non-entity fields + _id FK fields (all other entity fields removed)
  const mainFields: Field[] = fields
    .filter((f) => {
      if (!entityFieldNames.has(f.name)) return true; // non-entity field → keep
      const idx = f.name.indexOf("_");
      if (idx < 0) return true;
      const prefix = f.name.slice(0, idx);
      return f.name === `${prefix}_id`;               // only keep the id as FK
    })
    .map((f) => {
      const idx = f.name.indexOf("_");
      if (idx < 0) return f;
      const prefix = f.name.slice(0, idx);
      if (entityGroups[prefix] && f.name === `${prefix}_id`) {
        return { ...f, fk_table: _pluralizeEntity(prefix), fk_field: `${prefix}_id` };
      }
      return f;
    });

  const result: Table[] = [{ id: "t_main", name: mainName, fields: mainFields }];

  for (const [prefix, { idField, others }] of Object.entries(entityGroups)) {
    result.push({
      id: `t_${prefix}_${Date.now()}`,
      name: _pluralizeEntity(prefix),
      fields: [idField, ...others],
    });
  }

  return result;
}

/**
 * Parse the user prompt for explicit domain/context mentions like
 * "with hospitals", "including payments", "and lab results".
 * Returns display labels for detected domains so the UI can show a banner.
 */
function detectPromptExtras(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const DOMAIN_KEYWORDS: Array<[RegExp, string]> = [
    [/hospital|ward|clinic|icu|emergency\s*room/,          "Hospital fields"],
    [/payment|transaction|billing|invoice|checkout/,        "Payment fields"],
    [/lab\s*result|blood\s*test|diagnosis|clinical/,        "Lab/Clinical fields"],
    [/location|gps|latitude|longitude|geoloc/,              "Location fields"],
    [/login|session|activity\s*log|audit\s*trail/,          "Session/Activity fields"],
    [/review|rating|feedback|satisfaction/,                 "Review fields"],
    [/fraud|anomaly|suspicious|security\s*event/,           "Fraud/Anomaly fields"],
    [/inventory|stock|warehouse|shipment/,                  "Inventory fields"],
    [/enrollment|registration|attendance|schedule/,         "Enrollment fields"],
    [/insurance|policy|claim|premium/,                      "Insurance fields"],
    [/prescription|medication|dosage/,                      "Prescription fields"],
  ];
  // also detect "with X" / "including X" / "and X" patterns
  const explicitPatterns = [
    /\bwith\s+([\w\s]{3,30}?)(?:\s+and|\s+for|\s+data|\s+info|,|$)/gi,
    /\bincluding\s+([\w\s]{3,30}?)(?:\s+and|\s+for|\s+data|\s+info|,|$)/gi,
  ];
  const extras = new Set<string>();
  for (const [rx, label] of DOMAIN_KEYWORDS) {
    if (rx.test(p)) extras.add(label);
  }
  for (const rx of explicitPatterns) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(prompt)) !== null) {
      const term = m[1].trim();
      if (term.length >= 3 && !/dataset|data|field|column|row/i.test(term)) {
        extras.add(term.charAt(0).toUpperCase() + term.slice(1) + " fields");
      }
    }
  }
  return Array.from(extras).slice(0, 5);
}

// ── Draft persistence helpers ─────────────────────────────────────────────────

// Reads the autosaved draft — only on a true page reload (F5 / Ctrl+R),
// never when navigating to the page from within the app.
function readDraft(): { tables: Table[]; activeTableId: string; rowCount: number; mode: Mode } | null {
  const navEntry = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  const isReload = navEntry ? navEntry.type === "reload" : performance.navigation?.type === 1;
  if (!isReload) return null;
  if (sessionStorage.getItem("load_schema_id")) return null;
  const raw = sessionStorage.getItem("schema_builder_draft");
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (Array.isArray(d.tables) && d.tables.length > 0) return d;
  } catch {}
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchemaBuilder() {
  const [, setLocation] = useLocation();

  const [phase, setPhase]           = useState<Phase>(() => readDraft() ? "schema" : "idle");
  const [mode, setMode]             = useState<Mode>(() => readDraft()?.mode ?? "kaggle");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [errorMsg, setErrorMsg]     = useState("");

  const [searchQuery, setSearchQuery]         = useState("");
  const [searchResults, setSearchResults]     = useState<SmartResult[]>([]);
  const [extSourceFilter, setExtSourceFilter] = useState<string>("all");
  const [selectedDataSource, setSelectedDataSource] = useState("external");
  const [expandedExtIds,  setExpandedExtIds]  = useState<Set<string>>(new Set());
  const [selectedExtIds,  setSelectedExtIds]  = useState<Set<string>>(new Set());
  type ExtColState = { cols: Array<{ name: string; type: string }>; sample: Record<string, unknown>[] } | "loading" | "error";
  const [extColCache, setExtColCache] = useState<Record<string, ExtColState>>({});

  const [llmPrompt, setLlmPrompt]   = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError]     = useState("");
  const [smartResults, setSmartResults]         = useState<SmartResult[]>([]);
  const [selectedSmartIds, setSelectedSmartIds] = useState<Set<string>>(new Set());
  const [detectedExtras, setDetectedExtras]     = useState<string[]>([]);
  const [strikeWarning, setStrikeWarning] = useState<{ strikes: number; banned: boolean } | null>(null);
  const [pendingReview, setPendingReview] = useState(false);

  const [templateDatasetId,   setTemplateDatasetId]   = useState("");
  const [templateColumns,     setTemplateColumns]     = useState<string[]>([]);
  const [templatePreviewRows, setTemplatePreviewRows] = useState<Record<string, unknown>[]>([]);
  const [entityTables,        setEntityTables]        = useState<Array<{name:string; file:string; rows:number; columns:string[]; preview:Record<string,unknown>[]}>>([]);

  type MultiPreviewTable = { name: string; columns: string[]; rows: Record<string, unknown>[] };
  const [multiPreviewTables,    setMultiPreviewTables]    = useState<MultiPreviewTable[]>([]);
  const [multiPreviewActiveTab, setMultiPreviewActiveTab] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState<"csv" | "json" | "xlsx">("csv");
  const [sortBy,     setSortBy]     = useState<"downloads" | "rows_desc" | "rows_asc" | "alpha" | "newest" | "oldest">("downloads");
  const [sizeFilter, setSizeFilter] = useState<"any" | "small" | "medium" | "large">("any");

  const [datasetId, setDatasetId]           = useState("");
  const [kaggleRef, setKaggleRef]           = useState(() => sessionStorage.getItem("sb_kaggle_ref") ?? "");
  const [downloadSourceId, setDownloadSourceId] = useState(() => sessionStorage.getItem("sb_source_id") ?? "kaggle");
  const [originalSchema, setOriginalSchema] = useState<OriginalField[]>([]);
  const [tables, setTables]                 = useState<Table[]>(() => readDraft()?.tables ?? []);
  const [activeTableId, setActiveTableId]   = useState<string>(() => readDraft()?.activeTableId ?? "");
  const [rowCount, setRowCount]             = useState<number>(() => readDraft()?.rowCount ?? 1_000);

  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [aiFieldLoading, setAiFieldLoading] = useState<string | null>(null);

  const [showPureAiConfirm, setShowPureAiConfirm] = useState(false);

  const loadMultiTablePreset = (preset: MultiTablePreset) => {
    const tables: Table[] = preset.tables.map((t, i) => ({
      id: `t_pre_${i}`,
      name: t.name,
      rowCount: t.rowCount,
      fields: t.fields.map((f, j) =>
        makeField({
          id: `p${i}_${j}`,
          name: f.name, type: f.type,
          originalName: f.name, originalType: f.type,
          description: f.description,
          fk_table: f.fk_table,
          fk_field: f.fk_field,
          constraints: (() => {
            const c = f.constraints ?? {};
            const ev = (c as any).enum_values;
            return { ...c, enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined) } as FieldConstraints;
          })(),
        })
      ),
    }));
    setTables(tables);
    setActiveTableId(tables[0].id);
    setOriginalSchema([]);
    setDatasetId(""); setKaggleRef(""); setMode("llm"); setPhase("schema");
  };

  const loadPreset = (preset: Preset) => {
    const fields: Field[] = preset.fields.map((f, i) =>
      makeField({
        id: `p${i}`, name: f.name, type: f.type,
        originalName: f.name, originalType: f.type,
        description: f.description,
        constraints: (() => {
          const c = f.constraints ?? {};
          const ev = (c as any).enum_values;
          return { ...c, enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined) } as FieldConstraints;
        })(),
      })
    );
    setOriginalSchema(preset.fields.map((f) => ({ name: f.name, type: f.type, nullable: false })));
    setTables([{ id: "1", name: preset.table, fields }]);
    setDatasetId(""); setKaggleRef(""); setMode("llm"); setPhase("schema");
  };

  // ── Load saved schema from sessionStorage (set by SavedSchemas "Use" button) ──
  // window.location.search is always empty because of replaceState URL hiding
  const [loadSchemaId] = useState(() => {
    const id = sessionStorage.getItem("load_schema_id") || "";
    sessionStorage.removeItem("load_schema_id");
    return id;
  });

  useEffect(() => {
    if (!loadSchemaId) return;
    fetch(`${NODE_API}/api/schema/${loadSchemaId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((s) => {
        if (!s) return;
        const rawFields: any[] = Array.isArray(s.fields) ? s.fields : [];
        const fields: Field[] = rawFields.map((f: any, i: number) =>
          makeField({
            id:           `s${i}`,
            name:         f.name,
            type:         f.type || "string",
            null_rate:    f.null_rate ?? 0,
            originalName: f.name,
            originalType: f.type || "string",
            description:  f.description ?? "",
            constraints:  f.constraints ?? {},
            expanded:     false,
          })
        );
        setOriginalSchema(rawFields.map((f: any) => ({ name: f.name, type: f.type, nullable: false })));
        setTables([{ id: "1", name: s.table_name || s.name, fields }]);
        setMode("llm");
        setPhase("schema");
      })
      .catch(() => {});
  }, [loadSchemaId]);

  // Autosave draft to sessionStorage whenever the schema changes
  useEffect(() => {
    sessionStorage.setItem("schema_builder_draft", JSON.stringify({
      tables, activeTableId, rowCount, mode,
    }));
  }, [tables, activeTableId, rowCount, mode]);

  // Sync activeTableId whenever tables change (e.g. after LLM generation)
  useEffect(() => {
    if (tables.length > 0 && !tables.find((t) => t.id === activeTableId)) {
      setActiveTableId(tables[0].id);
    }
  }, [tables, activeTableId]);

  const getActiveTable = () =>
    tables.find((t) => t.id === activeTableId) ?? tables[0];

  // ── Field helpers ─────────────────────────────────────────────────────────

  const updateField = (tid: string, fid: string, patch: Partial<Field>) =>
    setTables((prev) =>
      prev.map((t) =>
        t.id === tid
          ? { ...t, fields: t.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) }
          : t
      )
    );

  const updateConstraint = (tid: string, fid: string, patch: Partial<FieldConstraints>) =>
    setTables((prev) =>
      prev.map((t) =>
        t.id === tid
          ? {
              ...t,
              fields: t.fields.map((f) =>
                f.id === fid ? { ...f, constraints: { ...f.constraints, ...patch } } : f
              ),
            }
          : t
      )
    );

  const removeField = (tid: string, fid: string) =>
    setTables((prev) =>
      prev.map((t) => (t.id === tid ? { ...t, fields: t.fields.filter((f) => f.id !== fid) } : t))
    );

  const addField = (tid: string) =>
    setTables((prev) =>
      prev.map((t) =>
        t.id === tid
          ? { ...t, fields: [...t.fields, makeField({ id: Date.now().toString(), name: `field_${t.fields.length + 1}`, type: "string" })] }
          : t
      )
    );

  const toggleExpanded = (tid: string, fid: string) =>
    setTables((prev) =>
      prev.map((t) =>
        t.id === tid
          ? { ...t, fields: t.fields.map((f) => (f.id === fid ? { ...f, expanded: !f.expanded } : f)) }
          : t
      )
    );

  // ── Multi-table management ────────────────────────────────────────────────

  const addTable = () => {
    const newId = `t${Date.now()}`;
    const newTable: Table = {
      id: newId,
      name: `table_${tables.length + 1}`,
      fields: [makeField({ id: `f0t${newId}`, name: "id", type: "uuid" })],
    };
    setTables((prev) => [...prev, newTable]);
    setActiveTableId(newId);
  };

  const removeTable = (tid: string) => {
    setTables((prev) => {
      const next = prev.filter((t) => t.id !== tid);
      if (activeTableId === tid && next.length > 0) {
        setActiveTableId(next[0].id);
      }
      return next;
    });
  };

  const updateTableName = (tid: string, name: string) =>
    setTables((prev) => prev.map((t) => (t.id === tid ? { ...t, name } : t)));

  const updateTableRowCount = (tid: string, count: number) =>
    setTables((prev) => prev.map((t) => (t.id === tid ? { ...t, rowCount: count } : t)));

  // ── Multi-table ZIP generation ────────────────────────────────────────────

  // Step 1 — generate sample rows for each table and show preview
  const handlePreviewMultiTable = async () => {
    setLoadingMsg(`Generating previews for ${tables.length} tables…`);
    setPhase("generating");
    try {
      const buildPayload = (t: Table) => ({
        table_name: t.name,
        fields: t.fields.map((f) => ({
          name:        f.name,
          field_type:  f.type,
          nullable:    f.null_rate > 0,
          description: f.description,
          constraints: {
            ...f.constraints,
            null_rate:   f.null_rate,
            enum_values: f.constraints.enum_values
              ? String(f.constraints.enum_values).split(",").map((v) => v.trim()).filter(Boolean)
              : [],
          },
        })),
      });

      const results = await Promise.all(
        tables.map((t) =>
          fetch(`${PYTHON_API}/api/generate-from-schema`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(t)),
          }).then(async (r) => {
            if (r.ok) return r.json();
            const body = await r.text().catch(() => "");
            throw new Error(`[${r.status}] ${t.name}: ${body.slice(0, 400)}`);
          }),
        )
      );

      setMultiPreviewTables(
        results.map((data, i) => ({
          name:    tables[i].name,
          columns: data.columns ?? [],
          rows:    (data.preview ?? []).slice(0, 10),
        }))
      );
      setMultiPreviewActiveTab(0);
      setPhase("multi_preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Preview generation failed.");
      setPhase("error");
    }
  };

  // Step 2 — confirmed by user, generate full dataset then navigate to preview
  const handleConfirmDownloadZip = async () => {
    setLoadingMsg(`Generating ${tables.length} tables…`);
    setPhase("generating");
    try {
      const payload = {
        tables: tables.map((t) => ({
          name: t.name,
          fields: t.fields.map((f) => ({
            name:        f.name,
            field_type:  f.type,
            nullable:    f.null_rate > 0,
            description: f.description,
            constraints: {
              ...f.constraints,
              null_rate:   f.null_rate,
              enum_values: f.constraints.enum_values
                ? String(f.constraints.enum_values).split(",").map((v) => v.trim()).filter(Boolean)
                : [],
            },
            fk_table: f.fk_table ?? null,
            fk_field: f.fk_field ?? null,
          })),
          row_count: t.rowCount ?? rowCount,
        })),
      };
      const res = await fetch(`${PYTHON_API}/api/generate-multi-table`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();
      sessionStorage.setItem("preview_params", JSON.stringify({
        id:            data.dataset_id,
        name:          data.primary_table,
        rows:          data.total_rows,
        entity_tables: (data.table_names as string[]).filter((n) => n !== data.primary_table),
      }));
      pushNotification({ title: data.primary_table, message: `${data.total_rows.toLocaleString()} rows · ${data.table_names.length} tables`, dataset_id: data.dataset_id });
      const userId = localStorage.getItem("user_id");
      if (userId) fetch(`${NODE_API}/api/activity/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, action_type: "dataset_downloaded", details: { table_name: data.primary_table, rows: data.total_rows, tables: data.table_names.length } }) }).catch(() => {});
      localStorage.setItem("last_path", "/schema-builder"); setLocation("/preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Multi-table generation failed.");
      setPhase("error");
    }
  };

  // Preview the 200-row template in DataPreview (template.csv served as fallback)
  const handleDownloadTemplate = () => {
    if (!templateDatasetId) return;
    sessionStorage.setItem("preview_params", JSON.stringify({
      id:   templateDatasetId,
      name: getActiveTable()?.name ?? "dataset",
      rows: 200,
    }));
    localStorage.setItem("last_path", "/schema-builder"); setLocation("/preview");
  };

  // ── Import user's own CSV ────────────────────────────────────────────────
  const handleUploadDataset = async (file: File) => {
    setLoadingMsg("Analyzing your CSV…");
    setPhase("loading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${PYTHON_API}/api/upload-dataset`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();

      const realSchema: OriginalField[] = data.schema.map((f: any) => ({
        name: f.name, type: f.type, nullable: f.nullable, sample_values: f.sample_values ?? [],
      }));
      const fields: Field[] = realSchema.map((f, i) =>
        makeField({ id: `up${i}`, name: f.name, type: f.type, originalName: f.name, originalType: f.type })
      );
      setOriginalSchema(realSchema);
      setDatasetId(data.dataset_id);
      setKaggleRef("");
      setMode("kaggle");
      setTables([{ id: "1", name: data.table_name || "uploaded_dataset", fields }]);
      setPhase("schema");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Upload failed.");
      setPhase("error");
    }
  };

  const isChanged = (field: Field): boolean => {
    const orig = originalSchema.find((o) => o.name === field.originalName);
    if (!orig) return true;
    return field.name !== orig.name || field.type !== orig.type;
  };

  // ── LLM ──────────────────────────────────────────────────────────────────

  // Pure LLM schema generation (fallback when no real dataset found)
  const runPureLlmGenerate = async () => {
    setLlmLoading(true);
    setLlmError("");
    const userId = localStorage.getItem("user_id") ?? undefined;
    const llmCtrl = new AbortController();
    const llmTimeout = setTimeout(() => llmCtrl.abort(), 120_000); // 2 min
    try {
      const res  = await fetch(`${NODE_API}/api/llm/generate-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: llmPrompt, user_id: userId }),
        signal: llmCtrl.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "banned") { setStrikeWarning({ strikes: data.strikes ?? 3, banned: true }); return; }
        if (data.error === "inappropriate_prompt") { setStrikeWarning({ strikes: data.strikes ?? 1, banned: false }); return; }
        if (data.error === "pending_review") { setPendingReview(true); return; }
        throw new Error(data.error || "LLM request failed");
      }
      setPendingReview(false);
      const fields: Field[] = data.fields.map((f: any, i: number) =>
        makeField({
          id: `llm${i}`, name: f.name, type: f.type,
          null_rate: typeof f.null_rate === "number" ? Math.round(Math.min(50, Math.max(0, f.null_rate))) : 0,
          originalName: f.name, originalType: f.type, description: f.description ?? "",
          constraints: (() => {
            const c = f.constraints ?? {};
            const ev = c.enum_values;
            return { ...c, enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined) };
          })(),
          expanded: false,
        })
      );
      setOriginalSchema(data.fields.map((f: any) => ({ name: f.name, type: f.type, nullable: false })));
      // Auto-detect entity groups and split into separate tables
      setTables(splitSchemaIntoTables(data.table_name, fields));
      setDatasetId(""); setKaggleRef(""); setMode("llm"); setPhase("schema");
    } catch (e: any) {
      clearTimeout(llmTimeout);
      const msg: string = e?.message ?? "";
      if (e?.name === "AbortError" || msg.toLowerCase().includes("aborted")) {
        setLlmError("Schema generation timed out. The AI is taking too long — please try again.");
      } else if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
        setLlmError("Cannot reach the backend. Make sure the Node server is running on port 5000.");
      } else if (msg.includes("401") || msg.toLowerCase().includes("authentication") || msg.toLowerCase().includes("invalid x-api-key")) {
        setLlmError("Anthropic API key is invalid or expired.");
      } else if (msg.toLowerCase().includes("credit") || msg.includes("402")) {
        setLlmError("Anthropic account has insufficient credits.");
      } else {
        setLlmError(msg || "Schema generation failed. Please try again.");
      }
      setPhase("idle");
    } finally {
      clearTimeout(llmTimeout);
      setLlmLoading(false);
    }
  };

  // Smart hybrid: search all sources first, then augment with LLM for missing fields
  const handleLlmGenerate = async () => {
    if (!llmPrompt.trim()) return;
    setLlmError("");
    setStrikeWarning(null);
    setPendingReview(false);

    // Safety check before doing anything — block search and generation if flagged
    const userId = localStorage.getItem("user_id");
    try {
      const safetyRes = await fetch(`${NODE_API}/api/llm/check-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: llmPrompt.trim(), user_id: userId }),
      });
      if (!safetyRes.ok) {
        const data = await safetyRes.json();
        if (data.error === "pending_review") { setPendingReview(true); return; }
        if (data.error === "inappropriate_prompt") { setStrikeWarning({ strikes: data.strikes ?? 1, banned: data.banned ?? false }); return; }
      }
    } catch {
      // If safety check fails, allow to proceed
    }

    setSortBy("downloads");
    setSizeFilter("any");
    setPhase("smart_searching");
    setLoadingMsg("Searching all dataset sources for a real match…");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min to allow wake-up retry
      let searchRes: Response;
      try {
        searchRes = await fetchPython(`${PYTHON_API}/api/smart-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: llmPrompt }),
          signal: controller.signal,
        }, (msg) => setLoadingMsg(msg));
      } finally {
        clearTimeout(timeoutId);
      }

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results: SmartResult[] = searchData.datasets ?? [];
        if (results.length > 0) {
          // Detect explicit extra domains from the prompt (e.g. "with hospitals")
          const extras = detectPromptExtras(llmPrompt);
          setDetectedExtras(extras);
          setSmartResults(results);
          setSelectedSmartIds(new Set());
          setPhase("smart_results");
          return;
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        // Non-timeout error: show message but still fall back
        console.warn("smart-search failed:", err?.message);
      }
    }

    // No real matches found — fall back to pure LLM generation
    setPhase("idle");
    await runPureLlmGenerate();
  };

  // User picked a real dataset from smart search results
  const handleSmartSelect = async (ds: SmartResult) => {
    setPhase("smart_augmenting");
    setLoadingMsg(`Downloading "${ds.title}" and identifying missing fields…`);

    const dlEndpoint = DOWNLOAD_ENDPOINTS[ds.source] ?? DOWNLOAD_ENDPOINTS["kaggle"];

    try {
      // 1. Download the real dataset
      const dlRes = await fetchPython(dlEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_ref: ds.ref }),
      }, (msg) => setLoadingMsg(msg));
      if (!dlRes.ok) throw new Error(await parsePythonError(dlRes));
      const dlData = await dlRes.json();

      setDatasetId(dlData.dataset_id);
      setKaggleRef(ds.ref);
      sessionStorage.setItem("sb_kaggle_ref", ds.ref);

      const realSchema: OriginalField[] = dlData.schema.map((f: any) => ({
        name: f.name, type: f.type, nullable: f.nullable, sample_values: f.sample_values ?? [],
      }));
      setOriginalSchema(realSchema);

      // 2. Ask LLM which fields from the prompt are missing from the real dataset
      const augRes = await fetch(`${NODE_API}/api/llm/augment-schema`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existing_schema: realSchema.map((f) => ({ name: f.name, type: f.type })),
          user_prompt: llmPrompt,
          detected_extras: detectedExtras,
        }),
      });
      const extraFields: any[] = augRes.ok ? ((await augRes.json()).fields ?? []) : [];

      // 3. Build combined schema: real fields (white) + LLM-added fields (yellow)
      const realFields: Field[] = realSchema.map((f, i) =>
        makeField({ id: `r${i}`, name: f.name, type: f.type, originalName: f.name, originalType: f.type })
      );
      const llmFields: Field[] = extraFields.map((f: any, i: number) =>
        makeField({
          id: `llm${i}`, name: f.name, type: f.type,
          originalName: f.name, originalType: f.type,
          description: f.description ?? "",
          llmGenerated: true,
          constraints: (() => {
            const c = f.constraints ?? {};
            const ev = c.enum_values;
            return { ...c, enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined) };
          })(),
          expanded: false,
        })
      );

      setTables(splitSchemaIntoTables(ds.title, [...realFields, ...llmFields]));
      setMode("kaggle");
      setPhase("schema");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to download and augment dataset.");
      setPhase("error");
    }
  };

  // Multi-dataset merge: download all selected, union their schemas, keep primary for CTGAN
  const handleMergeSelected = async () => {
    const toDownload = smartResults.filter((ds) => selectedSmartIds.has(`${ds.source}:${ds.ref}`));
    if (toDownload.length < 2) return;

    setPhase("smart_augmenting");
    setLoadingMsg(`Downloading and merging ${toDownload.length} datasets…`);

    try {
      const settled = await Promise.allSettled(
        toDownload.map((ds) =>
          fetch(DOWNLOAD_ENDPOINTS[ds.source] ?? DOWNLOAD_ENDPOINTS["kaggle"], {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset_ref: ds.ref }),
          })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Download failed: ${ds.title}`))))
            .then((data) => ({ ds, data }))
        )
      );

      const successful = settled
        .filter((r): r is PromiseFulfilledResult<{ ds: SmartResult; data: any }> => r.status === "fulfilled")
        .map((r) => r.value)
        .sort((a, b) => (b.ds.downloadCount || 0) - (a.ds.downloadCount || 0));

      if (successful.length === 0) throw new Error("All dataset downloads failed.");

      const [primary, ...others] = successful;
      setDatasetId(primary.data.dataset_id);
      setKaggleRef(primary.ds.ref);
      sessionStorage.setItem("sb_kaggle_ref", primary.ds.ref);

      const primarySchema: OriginalField[] = primary.data.schema.map((f: any) => ({
        name: f.name, type: f.type, nullable: f.nullable, sample_values: f.sample_values ?? [],
      }));
      setOriginalSchema(primarySchema);

      const seenNames = new Set(primarySchema.map((f) => f.name.toLowerCase()));

      const primaryFields: Field[] = primarySchema.map((f, i) =>
        makeField({ id: `r${i}`, name: f.name, type: f.type, originalName: f.name, originalType: f.type })
      );

      const mergedFields: Field[] = [];
      for (const { ds, data } of others) {
        const srcLabel = DATA_SOURCES.find((s) => s.id === ds.source)?.label ?? ds.source;
        for (const f of (data.schema ?? [])) {
          if (!seenNames.has((f.name as string).toLowerCase())) {
            seenNames.add((f.name as string).toLowerCase());
            mergedFields.push(
              makeField({ id: `m${mergedFields.length}`, name: f.name, type: f.type,
                originalName: f.name, originalType: f.type, mergedFrom: srcLabel })
            );
          }
        }
      }

      // If user had a prompt, also augment with any LLM-detected missing fields
      let llmFields: Field[] = [];
      if (llmPrompt.trim()) {
        const allNames = [...primarySchema.map((f) => f.name), ...mergedFields.map((f) => f.name)];
        try {
          const augRes = await fetch(`${NODE_API}/api/llm/augment-schema`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              existing_schema: allNames.map((n) => ({ name: n, type: "string" })),
              user_prompt: llmPrompt,
              detected_extras: detectedExtras,
            }),
          });
          const extras: any[] = augRes.ok ? ((await augRes.json()).fields ?? []) : [];
          llmFields = extras.map((f: any, i: number) =>
            makeField({
              id: `llm${i}`, name: f.name, type: f.type,
              originalName: f.name, originalType: f.type,
              description: f.description ?? "", llmGenerated: true,
              constraints: (() => {
                const c = f.constraints ?? {};
                const ev = c.enum_values;
                return { ...c, enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined) };
              })(),
            })
          );
        } catch { /* non-fatal */ }
      }

      const mergedTitle = toDownload.map((d) => d.title).join(" + ");
      setTables([{ id: "1", name: mergedTitle, fields: [...primaryFields, ...mergedFields, ...llmFields] }]);
      setMode("kaggle");
      setPhase("schema");
      setSelectedSmartIds(new Set());
    } catch (e: any) {
      setErrorMsg(e.message ?? "Dataset merge failed.");
      setPhase("error");
    }
  };

  const handleAiSuggestField = async (tid: string, field: Field) => {
    setAiFieldLoading(field.id);
    try {
      const res = await fetch(`${NODE_API}/api/llm/suggest-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_name: field.name, description: field.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const ev = data.constraints?.enum_values;
      updateField(tid, field.id, {
        type: data.type,
        description: data.description ?? field.description,
        constraints: {
          ...data.constraints,
          enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined),
        },
      });
    } catch {
      // silently ignore — field stays as-is
    } finally {
      setAiFieldLoading(null);
    }
  };

  // ── External dataset sources ──────────────────────────────────────────────

  const DATA_SOURCES = [
    { id: "kaggle",      label: "Kaggle",        placeholder: "e.g. titanic, diabetes, house prices…",   desc: "50,000+ community datasets" },
    { id: "huggingface", label: "Hugging Face",  placeholder: "e.g. banking, sentiment, medical…",       desc: "50,000+ ML-ready datasets" },
    { id: "uci",         label: "UCI ML Repo",   placeholder: "e.g. iris, wine, breast cancer…",         desc: "Classic academic benchmarks" },
    { id: "openml",      label: "OpenML",        placeholder: "e.g. diabetes, credit, spam…",            desc: "Research datasets with benchmarks" },
    { id: "datagov_ph",  label: "Data.gov.ph",   placeholder: "e.g. population, education, health…",    desc: "PH government open data" },
    { id: "psa",         label: "PSA",           placeholder: "e.g. census, labor, poverty…",            desc: "PH Statistics Authority" },
  ];

  const DOWNLOAD_ENDPOINTS: Record<string, string> = {
    kaggle:      `${PYTHON_API}/api/kaggle/download`,
    huggingface: `${PYTHON_API}/api/huggingface/download`,
    uci:         `${PYTHON_API}/api/uci/download`,
    openml:      `${PYTHON_API}/api/openml/download`,
    datagov_ph:  `${PYTHON_API}/api/datagov_ph/download`,
    psa:         `${PYTHON_API}/api/psa/download`,
  };

  const parseRowCount = (size: string): number => {
    const m = size.replace(/,/g, "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  const applyFiltersSort = (
    results: SmartResult[],
    sourceFilter: string,
    activeSortBy: string,
    activeSizeFilter: string,
  ): SmartResult[] => {
    let out = sourceFilter === "all" ? [...results] : results.filter((r) => r.source === sourceFilter);
    if (activeSizeFilter !== "any") {
      out = out.filter((ds) => {
        const rows = parseRowCount(ds.size);
        if (activeSizeFilter === "small")  return rows > 0 && rows < 1_000;
        if (activeSizeFilter === "medium") return rows >= 1_000 && rows <= 50_000;
        if (activeSizeFilter === "large")  return rows > 50_000;
        return true;
      });
    }
    const dateOf = (ds: SmartResult) => ds.lastUpdated ?? "";
    const titleOf = (ds: SmartResult) => (ds.title ?? "").toLowerCase().replace(/^[^a-z0-9]+/i, "").trim();
    switch (activeSortBy) {
      case "downloads": out.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0)); break;
      case "rows_desc":  out.sort((a, b) => parseRowCount(b.size) - parseRowCount(a.size)); break;
      case "rows_asc":   out.sort((a, b) => parseRowCount(a.size) - parseRowCount(b.size)); break;
      case "alpha": {
        out.sort((a, b) => {
          const ta = titleOf(a), tb = titleOf(b);
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        break;
      }
      case "newest":
        out.sort((a, b) => {
          const da = dateOf(a), db = dateOf(b);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.localeCompare(da);
        });
        break;
      case "oldest":
        out.sort((a, b) => {
          const da = dateOf(a), db = dateOf(b);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da.localeCompare(db);
        });
        break;
    }
    return out;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    // Safety check before allowing dataset search
    const userId = localStorage.getItem("user_id");
    try {
      const safetyRes = await fetch(`${NODE_API}/api/llm/check-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: searchQuery.trim(), user_id: userId }),
      });
      if (!safetyRes.ok) {
        const data = await safetyRes.json();
        if (data.error === "pending_review") { setPendingReview(true); return; }
        if (data.error === "inappropriate_prompt") { setStrikeWarning({ strikes: 1, banned: false }); return; }
      }
    } catch {
      // If safety check itself fails, allow the search to proceed
    }

    setPendingReview(false);
    setExtSourceFilter("all");
    setSortBy("downloads");
    setSizeFilter("any");
    setSelectedExtIds(new Set());
    setExpandedExtIds(new Set());
    setLoadingMsg("Searching all dataset sources…");
    setPhase("loading");
    try {
      // Ask the LLM to expand the query into related search terms (best-effort)
      let expandedTerms: string[] = [];
      try {
        const expandRes = await fetch(`${NODE_API}/api/llm/expand-search-query`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery }),
          signal: AbortSignal.timeout(2000),
        });
        if (expandRes.ok) {
          const data = await expandRes.json();
          expandedTerms = data.terms ?? [];
        }
      } catch {
        // Silent fallback — domain map in Python will still kick in
      }

      const res = await fetch(`${PYTHON_API}/api/smart-search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: searchQuery, expanded_terms: expandedTerms }),
      });
      if (!res.ok) throw new Error(await parsePythonError(res));
      setSearchResults((await res.json()).datasets ?? []);
      setPhase("results");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Search failed. Is the Python service running on port 8000?");
      setPhase("error");
    }
  };

  const toggleExpandExt = (key: string) => {
    setExpandedExtIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectExt = (key: string) => {
    setSelectedExtIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadExtColumns = async (ds: SmartResult, key: string) => {
    setExtColCache((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch(`${PYTHON_API}/api/dataset-peek`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: ds.source, dataset_ref: ds.ref }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setExtColCache((prev) => ({ ...prev, [key]: { cols: data.columns, sample: data.preview } }));
    } catch {
      setExtColCache((prev) => ({ ...prev, [key]: "error" }));
    }
  };

  const handleCombineExtDatasets = async () => {
    const toDownload = searchResults.filter((ds) => selectedExtIds.has(`${ds.source}:${ds.ref}`));
    if (toDownload.length < 2) return;
    setPhase("smart_augmenting");
    setLoadingMsg(`Downloading and combining ${toDownload.length} datasets…`);
    try {
      const settled = await Promise.allSettled(
        toDownload.map((ds) =>
          fetch(DOWNLOAD_ENDPOINTS[ds.source] ?? DOWNLOAD_ENDPOINTS["kaggle"], {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset_ref: ds.ref }),
          })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed: ${ds.title}`))))
            .then((data) => ({ ds, data }))
        )
      );
      const successful = settled
        .filter((r): r is PromiseFulfilledResult<{ ds: SmartResult; data: any }> => r.status === "fulfilled")
        .map((r) => r.value)
        .sort((a, b) => (b.ds.downloadCount || 0) - (a.ds.downloadCount || 0));
      if (successful.length === 0) throw new Error("All downloads failed.");
      const [primary, ...others] = successful;
      setDatasetId(primary.data.dataset_id);
      setKaggleRef(primary.ds.ref);
      sessionStorage.setItem("sb_kaggle_ref", primary.ds.ref);
      const primarySchema: OriginalField[] = primary.data.schema.map((f: any) => ({
        name: f.name, type: f.type, nullable: f.nullable, sample_values: f.sample_values ?? [],
      }));
      setOriginalSchema(primarySchema);
      const seenNames = new Set(primarySchema.map((f) => f.name.toLowerCase()));
      const primaryFields: Field[] = primarySchema.map((f, i) =>
        makeField({ id: `r${i}`, name: f.name, type: f.type, originalName: f.name, originalType: f.type })
      );
      const mergedFields: Field[] = [];
      for (const { ds, data } of others) {
        const srcLabel = DATA_SOURCES.find((s) => s.id === ds.source)?.label ?? ds.source;
        for (const f of (data.schema ?? [])) {
          if (!seenNames.has((f.name as string).toLowerCase())) {
            seenNames.add((f.name as string).toLowerCase());
            mergedFields.push(
              makeField({ id: `m${mergedFields.length}`, name: f.name, type: f.type,
                originalName: f.name, originalType: f.type, mergedFrom: srcLabel })
            );
          }
        }
      }
      const title = toDownload.map((d) => d.title).join(" + ");
      setTables([{ id: "1", name: title, fields: [...primaryFields, ...mergedFields] }]);
      setMode("kaggle"); setPhase("schema");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Combine failed."); setPhase("error");
    }
  };

  const handleSelectDataset = async (ds: SmartResult) => {
    const sourceId = ds.source ?? "kaggle";
    const sourceLabel = ds.sourceLabel ?? DATA_SOURCES.find((s) => s.id === sourceId)?.label ?? sourceId;
    setSelectedDataSource(sourceLabel);
    setKaggleRef(ds.ref);
    setDownloadSourceId(sourceId);
    sessionStorage.setItem("sb_kaggle_ref", ds.ref);
    sessionStorage.setItem("sb_source_id", sourceId);
    setLoadingMsg(`Downloading "${ds.title}" from ${sourceLabel}…`);
    setPhase("loading");
    try {
      const res = await fetchPython(DOWNLOAD_ENDPOINTS[sourceId] ?? DOWNLOAD_ENDPOINTS["kaggle"], {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_ref: ds.ref }),
      }, (msg) => setLoadingMsg(msg));
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();
      setDatasetId(data.dataset_id);

      const orig: OriginalField[] = data.schema.map((f: any) => ({
        name: f.name, type: f.type, nullable: f.nullable, sample_values: f.sample_values ?? [],
      }));
      setOriginalSchema(orig);

      setTables([{
        id: "1", name: ds.title,
        fields: orig.map((f, i) =>
          makeField({ id: `f${i}`, name: f.name, type: f.type, originalName: f.name, originalType: f.type })
        ),
      }]);
      setMode("kaggle"); setPhase("schema");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Download failed."); setPhase("error");
    }
  };

  const handleRedownload = async () => {
    if (!kaggleRef) return;
    setLoadingMsg("Preparing dataset…");
    setPhase("loading");
    try {
      const res = await fetchPython(DOWNLOAD_ENDPOINTS[downloadSourceId] ?? DOWNLOAD_ENDPOINTS["kaggle"], {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_ref: kaggleRef }),
      }, (msg) => setLoadingMsg(msg));
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();
      setDatasetId(data.dataset_id);
      setPhase("schema");
      // Pass the new id directly — React state won't be committed yet at this point
      await handleGenerate(data.dataset_id);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Regeneration failed."); setPhase("error");
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSaveSchema = async () => {
    const at = getActiveTable();
    if (!at) return;
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`${NODE_API}/api/schemas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          name: at.name,
          table_name: at.name,
          fields: at.fields.map((f) => ({ name: f.name, type: f.type, nullable: f.null_rate > 0 })),
        }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  };

  // ── Generate template (LLM mode — step 1) ───────────────────────────────

  const handleGenerateTemplate = async () => {
    const at = getActiveTable();
    if (!at) return;
    setLoadingMsg("Generating 200-row template via schema…");
    setPhase("generating");
    try {
      const payload = {
        table_name: at.name,
        fields: at.fields.map((f) => ({
          name:        f.name,
          field_type:  f.type,
          nullable:    f.null_rate > 0,
          description: f.description,
          constraints: {
            ...f.constraints,
            null_rate:   f.null_rate,
            enum_values: f.constraints.enum_values
              ? String(f.constraints.enum_values).split(",").map((v) => v.trim()).filter(Boolean)
              : [],
          },
        })),
      };
      const res = await fetch(`${PYTHON_API}/api/generate-from-schema`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();
      setTemplateDatasetId(data.dataset_id);
      setTemplateColumns(data.columns);
      setTemplatePreviewRows(data.preview);
      setEntityTables(data.entity_tables ?? []);
      setRowCount(10_000);
      setPhase("template_preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Template generation failed."); setPhase("error");
    }
  };

  // ── Expand template with CTGAN (LLM mode — step 2) ──────────────────────

  const handleExpand = async () => {
    setLoadingMsg(`Training CTGAN on 200-row template, scaling to ${rowCount.toLocaleString()} rows…`);
    setPhase("generating");
    try {
      const at2 = getActiveTable();
      const res = await fetch(`${PYTHON_API}/api/expand-with-ctgan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: templateDatasetId,
          row_count:  rowCount,
          fields: (at2?.fields ?? []).map((f) => ({ name: f.name, null_rate: f.null_rate })),
        }),
      });
      if (!res.ok) throw new Error(await parsePythonError(res));
      const data = await res.json();

      const userId = localStorage.getItem("user_id");
      if (userId) {
        await fetch(`${NODE_API}/api/datasets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name: getActiveTable()?.name ?? "dataset", kaggle_ref: "", python_dataset_id: data.dataset_id, row_count: rowCount, source: "llm" }),
        }).catch(() => {});
      }
      sessionStorage.setItem("preview_params", JSON.stringify({
        id: data.dataset_id, name: getActiveTable()?.name ?? "dataset",
        rows: rowCount, ref: "",
        entity_tables: entityTables,
      }));
      pushNotification({ title: getActiveTable()?.name ?? "dataset", message: `${rowCount.toLocaleString()} rows · LLM + CTGAN`, dataset_id: data.dataset_id });
      localStorage.setItem("last_path", "/schema-builder"); setLocation("/preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "CTGAN expansion failed."); setPhase("error");
    }
  };

  // ── LLM mode single-table: generate template + CTGAN in one step → DataPreview
  const handleLlmGenerateAndPreview = async () => {
    const at = getActiveTable();
    if (!at) return;

    setLoadingMsg("Generating AI template…");
    setPhase("generating");

    const ctrl = new AbortController();
    const genTimeout = setTimeout(() => ctrl.abort(), 15 * 60 * 1000); // 15 min
    try {
      // Step 1: generate 200-row template
      const templateRes = await fetchPython(`${PYTHON_API}/api/generate-from-schema`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: at.name,
          fields: at.fields.map((f) => ({
            name:        f.name,
            field_type:  f.type,
            nullable:    f.null_rate > 0,
            description: f.description,
            constraints: {
              ...f.constraints,
              null_rate:   f.null_rate,
              enum_values: f.constraints.enum_values
                ? String(f.constraints.enum_values).split(",").map((v) => v.trim()).filter(Boolean)
                : [],
            },
          })),
        }),
        signal: ctrl.signal,
      });
      if (!templateRes.ok) throw new Error(await parsePythonError(templateRes));
      const templateData = await templateRes.json();

      setLoadingMsg(`Expanding to ${rowCount.toLocaleString()} rows with CTGAN…`);

      // Step 2: expand with CTGAN — include fields so null_rate is applied after expansion
      const expandRes = await fetchPython(`${PYTHON_API}/api/expand-with-ctgan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: templateData.dataset_id,
          row_count:  rowCount,
          fields: at.fields.map((f) => ({ name: f.name, null_rate: f.null_rate })),
        }),
        signal: ctrl.signal,
      });
      if (!expandRes.ok) throw new Error(await parsePythonError(expandRes));
      const expandData = await expandRes.json();

      const userId = localStorage.getItem("user_id");
      if (userId) {
        await fetch(`${NODE_API}/api/datasets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name: at.name, kaggle_ref: "", python_dataset_id: expandData.dataset_id, row_count: rowCount, source: "llm" }),
        }).catch(() => {});
      }

      pushNotification({ title: at.name, message: `${rowCount.toLocaleString()} rows · LLM + CTGAN`, dataset_id: expandData.dataset_id });
      sessionStorage.setItem("preview_params", JSON.stringify({
        id:            expandData.dataset_id,
        name:          at.name,
        rows:          rowCount,
        ref:           "",
        entity_tables: templateData.entity_tables ?? [],
      }));
      localStorage.setItem("last_path", "/schema-builder"); setLocation("/preview");
    } catch (e: any) {
      clearTimeout(genTimeout);
      const isAbort = e?.name === "AbortError" || (e?.message ?? "").toLowerCase().includes("aborted");
      setErrorMsg(isAbort
        ? "Generation timed out — the server is taking too long. Please wait 30 seconds and try again."
        : (e.message ?? "Generation failed."));
      setPhase("error");
    } finally {
      clearTimeout(genTimeout);
    }
  };

  // ── Generate (Kaggle/CTGAN mode; hybrid when LLM-added fields present) ───

  const handleGenerate = async (overrideDatasetId?: string) => {
    const at = getActiveTable();
    if (!at) return;
    const activeDatasetId = overrideDatasetId ?? datasetId;
    if (!activeDatasetId) return;
    setLoadingMsg(`Training CTGAN · generating ${rowCount.toLocaleString()} rows…`);
    setPhase("generating");

    const hasLlmFields = at.fields.some((f) => f.llmGenerated || f.mergedFrom);
    const realFields   = at.fields.filter((f) => !f.llmGenerated && !f.mergedFrom);
    const llmFields    = at.fields.filter((f) =>  f.llmGenerated || f.mergedFrom);

    const changes = realFields.map((f) => ({
      original_name: f.originalName || f.name,
      new_name:      f.name,
      original_type: f.originalType || f.type,
      new_type:      f.type,
      nullable:      f.null_rate > 0,
      null_rate:     f.null_rate,
    }));

    try {
      let endpoint = `${PYTHON_API}/api/generate`;
      let body: any = { dataset_id: activeDatasetId, changes, row_count: rowCount };

      if (hasLlmFields) {
        endpoint = `${PYTHON_API}/api/generate-hybrid`;
        body.extra_fields = llmFields.map((f) => ({
          name:        f.name,
          field_type:  f.type,
          description: f.description,
          constraints: {
            ...f.constraints,
            null_rate:   f.null_rate,
            enum_values: f.constraints.enum_values
              ? String(f.constraints.enum_values).split(",").map((v) => v.trim()).filter(Boolean)
              : [],
          },
        }));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000); // 15 min (includes wake-up retry wait + CTGAN training)
      const res = await fetchPython(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (!res.ok) throw new Error(await parsePythonError(res));

      const userId = localStorage.getItem("user_id");
      if (userId) {
        await fetch(`${NODE_API}/api/datasets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name: getActiveTable()?.name ?? "dataset", kaggle_ref: kaggleRef, python_dataset_id: activeDatasetId, row_count: rowCount, source: selectedDataSource }),
        }).catch(() => {});
      }
      sessionStorage.setItem("preview_params", JSON.stringify({ id: activeDatasetId, name: getActiveTable()?.name ?? "dataset", rows: rowCount, ref: kaggleRef }));
      pushNotification({ title: getActiveTable()?.name ?? "dataset", message: `${rowCount.toLocaleString()} rows · ${selectedDataSource}`, dataset_id: activeDatasetId });
      localStorage.setItem("last_path", "/schema-builder"); setLocation("/preview");
    } catch (e: any) {
      const msg = e.message ?? "Generation failed. Check the Python service logs.";
      if (e?.name === "AbortError" || msg.toLowerCase().includes("aborted")) {
        setErrorMsg("Generation timed out — the server is taking too long. Please wait 30 seconds and try again.");
      } else if (msg.toLowerCase().includes("dataset not found") || msg.toLowerCase().includes("please download")) {
        setDatasetId("");
        setErrorMsg("Your dataset session expired — the generation server was restarted. Click \"Regenerate Dataset\" to continue.");
      } else {
        setErrorMsg(msg);
      }
      setPhase("error");
    }
  };

  // ── Constraint panel per type ─────────────────────────────────────────────

  const renderConstraints = (table: Table, field: Field) => {
    const c = field.constraints;
    const uc = (patch: Partial<FieldConstraints>) => updateConstraint(table.id, field.id, patch);
    const colClass = "flex flex-col gap-1";
    const labelClass = "text-[11px] font-medium text-gray-500 uppercase tracking-wide";
    const inputClass = "text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white";

    const numericPanel = (
      <div className="grid grid-cols-3 gap-3">
        <div className={colClass}>
          <label className={labelClass}>Min</label>
          <input type="number" className={inputClass}
            value={c.min_val ?? ""} placeholder="e.g. 0"
            onChange={(e) => uc({ min_val: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </div>
        <div className={colClass}>
          <label className={labelClass}>Max</label>
          <input type="number" className={inputClass}
            value={c.max_val ?? ""} placeholder="e.g. 1000"
            onChange={(e) => uc({ max_val: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </div>
        <div className={colClass}>
          <label className={labelClass}>Distribution</label>
          <div className="flex gap-1">
            {(["uniform","normal","skewed"] as const).map((d) => (
              <button key={d} onClick={() => uc({ distribution: d })}
                className={`flex-1 text-[11px] py-1.5 rounded-md border transition-colors capitalize
                  ${(c.distribution ?? "uniform") === d
                    ? "bg-purple-600 text-white border-purple-600"
                    : "border-gray-200 text-gray-500 hover:border-purple-300"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

    const panels: Record<string, JSX.Element | null> = {
      id: (
        <div className="grid grid-cols-2 gap-3">
          <div className={colClass}>
            <label className={labelClass}>Prefix</label>
            <input type="text" className={inputClass}
              value={c.id_prefix ?? ""} placeholder='e.g. L  →  L-0001'
              onChange={(e) => uc({ id_prefix: e.target.value || undefined })} />
          </div>
          <div className={colClass}>
            <label className={labelClass}>Padding digits</label>
            <input type="number" className={inputClass} min={1} max={10}
              value={c.id_pad ?? 4}
              onChange={(e) => uc({ id_pad: Number(e.target.value) || 4 })} />
          </div>
        </div>
      ),
      integer: numericPanel,
      float:   numericPanel,
      boolean: (
        <div className={colClass} style={{ maxWidth: 220 }}>
          <label className={labelClass}>True ratio — {Math.round((c.true_ratio ?? 0.5) * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05}
            value={c.true_ratio ?? 0.5} className="accent-purple-600"
            onChange={(e) => uc({ true_ratio: Number(e.target.value) })} />
          <p className="text-[11px] text-gray-400">
            {Math.round((c.true_ratio ?? 0.5) * 100)}% true / {Math.round((1 - (c.true_ratio ?? 0.5)) * 100)}% false
          </p>
        </div>
      ),
      date: (
        <div className="grid grid-cols-2 gap-3">
          <div className={colClass}>
            <label className={labelClass}>From date</label>
            <input type="date" className={inputClass}
              value={c.date_from ?? ""} onChange={(e) => uc({ date_from: e.target.value || undefined })} />
          </div>
          <div className={colClass}>
            <label className={labelClass}>To date</label>
            <input type="date" className={inputClass}
              value={c.date_to ?? ""} onChange={(e) => uc({ date_to: e.target.value || undefined })} />
          </div>
        </div>
      ),
      string: (
        <div className="space-y-3">
          <div className={colClass}>
            <label className={labelClass}>Categories (comma-separated) — leave blank for free text</label>
            <input type="text" className={inputClass}
              value={c.enum_values ?? ""} placeholder='e.g. Low, Medium, High   or   Active, Inactive'
              onChange={(e) => uc({ enum_values: e.target.value || undefined })} />
          </div>
          {!c.enum_values && (
            <div className={colClass} style={{ maxWidth: 200 }}>
              <label className={labelClass}>Unique values (cardinality)</label>
              <input type="number" className={inputClass} min={1}
                value={c.cardinality ?? ""} placeholder="e.g. 50"
                onChange={(e) => uc({ cardinality: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
          )}
        </div>
      ),
    };

    const panel = panels[field.type] ?? null;

    return (
      <tr className="bg-purple-50/40 border-b border-gray-100">
        <td colSpan={6} className="px-6 py-3">
          <div className="space-y-3">
            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Description</label>
              <input type="text" className={inputClass + " w-full"}
                value={field.description} placeholder="What does this field represent?"
                onChange={(e) => updateField(table.id, field.id, { description: e.target.value })} />
            </div>

            {/* Null rate */}
            <div className="flex items-center gap-3">
              <span className={labelClass + " whitespace-nowrap"}>Null rate — {field.null_rate}%</span>
              <input type="range" min={0} max={50} step={1}
                value={field.null_rate} className="w-40 accent-purple-600"
                onChange={(e) => updateField(table.id, field.id, { null_rate: Number(e.target.value) })} />
              <span className="text-xs text-gray-500 w-8">{field.null_rate}%</span>
            </div>

            {/* FK reference — only shown when 2+ tables exist */}
            {tables.length >= 2 && (
              <div className={colClass}>
                <label className={labelClass}>Foreign Key Reference</label>
                <select
                  value={field.fk_table && field.fk_field ? `${field.fk_table}.${field.fk_field}` : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateField(table.id, field.id, { fk_table: undefined, fk_field: undefined });
                    } else {
                      const dotIdx = val.indexOf(".");
                      const tName  = val.slice(0, dotIdx);
                      const fName  = val.slice(dotIdx + 1);
                      updateField(table.id, field.id, { fk_table: tName, fk_field: fName });
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">— No foreign key —</option>
                  {tables
                    .filter((t) => t.id !== table.id)
                    .flatMap((t) =>
                      t.fields.map((f) => ({
                        key: `${t.name}.${f.name}`,
                        label: `${t.name} → ${f.name}`,
                      }))
                    )
                    .map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                </select>
                {field.fk_table && field.fk_field && (
                  <p className="text-[10px] text-green-600 mt-0.5">
                    Values will be sampled from <strong>{field.fk_table}.{field.fk_field}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Type-specific */}
            {panel && (
              <div>
                <p className={labelClass + " mb-2"}>
                  {field.type === "string"  ? "Value constraints" :
                   field.type === "boolean" ? "Distribution" :
                   field.type === "date"    ? "Date range" :
                   field.type === "id"      ? "ID format" :
                   "Range & distribution"}
                </p>
                {panel}
              </div>
            )}

          </div>
        </td>
      </tr>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  const changedCount = mode === "kaggle"
    ? (getActiveTable()?.fields.filter(isChanged).length ?? 0)
    : 0;

  return (
    <div className="space-y-4">

      {/* ── Pure-AI confirmation modal ── */}
      {showPureAiConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Generate with AI only?</h3>
                <p className="text-sm text-gray-500 mt-0.5">No real dataset will be used as a reference.</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Disclaimer</p>
              <p>Value ranges, distributions, and category lists are AI estimates. They may not reflect actual real-world data patterns. Review and adjust each field's constraints before generating.</p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowPureAiConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPureAiConfirm(false);
                  setPhase("idle");
                  setSelectedSmartIds(new Set());
                  setDetectedExtras([]);
                  runPureLlmGenerate();
                }}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors">
                Continue with AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Presets strip ── */}

      {/* ── LLM panel ── */}
      {phase !== "loading" && phase !== "generating" && phase !== "smart_searching" && phase !== "smart_augmenting" && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">LLM Schema Generator</p>
              <p className="text-xs text-gray-400">Describe your dataset — AI builds the schema with constraints</p>
            </div>
          </div>
          <div className="px-4 py-3 flex gap-2">
            <input
              value={llmPrompt}
              onChange={(e) => setLlmPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLlmGenerate()}
              placeholder="e.g. A cybersecurity attack dataset with IP addresses and threat levels"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={handleLlmGenerate} disabled={llmLoading || !llmPrompt.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 whitespace-nowrap">
              {llmLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {llmLoading ? "Searching…" : "Generate Schema"}
            </button>
          </div>
          {llmError && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">{sanitizeErrorMsg(llmError)}</p>
            </div>
          )}
          {pendingReview && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800">Prompt sent for instructor review</p>
                <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                  Your prompt was flagged and has been sent to your instructor for review. You will receive an email once it is approved, after which you can resubmit it.
                </p>
              </div>
            </div>
          )}
          {strikeWarning && !strikeWarning.banned && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Inappropriate prompt detected — Strike {strikeWarning.strikes}/3</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Your prompt violates our Terms of Service. Generating datasets intended for fraud, identity theft, or privacy violations is not allowed.
                  {strikeWarning.strikes >= 2 && " One more violation will result in a permanent ban."}
                </p>
              </div>
            </div>
          )}
          {strikeWarning && strikeWarning.banned && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-red-50 border border-red-300 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800">Account permanently banned</p>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                  Your account has been permanently banned due to repeated violations of the Terms of Service. Contact support if you believe this is an error.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Smart search results panel ── */}
      {phase === "smart_searching" && (
        <GeneratingLoader phase="searching" />
      )}

      {phase === "smart_augmenting" && (
        <GeneratingLoader phase="augmenting" message={loadingMsg || undefined} />
      )}

      {phase === "smart_results" && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Real datasets found — {smartResults.length} match{smartResults.length !== 1 ? "es" : ""}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Check one or more datasets. Their fields will be merged (duplicates removed) and any fields
                from your description that are missing will be added automatically.
              </p>
            </div>
            <button
              onClick={() => setShowPureAiConfirm(true)}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 font-medium underline whitespace-nowrap mt-0.5">
              Skip — use pure AI
            </button>
          </div>

          {/* Detected extras banner */}
          {detectedExtras.length > 0 && (
            <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-purple-800">Detected from your prompt — will be auto-added:</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detectedExtras.map((e) => (
                    <span key={e} className="text-[10px] font-medium px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                      + {e}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Source legend + sort/size controls */}
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-2">
              {Object.entries(SOURCE_COLORS)
                .filter(([id]) => smartResults.some((r) => r.source === id))
                .map(([id, c]) => (
                  <span key={id} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.badge} ${c.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    {DATA_SOURCES.find((s) => s.id === id)?.label ?? id}
                  </span>
                ))}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="downloads">Most downloaded</option>
                <option value="rows_desc">Most rows</option>
                <option value="rows_asc">Fewest rows</option>
                <option value="alpha">A – Z</option>
              </select>
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value as typeof sizeFilter)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="any">Any size</option>
                <option value="small">Small (&lt; 1K rows)</option>
                <option value="medium">Medium (1K – 50K rows)</option>
                <option value="large">Large (50K+ rows)</option>
              </select>
            </div>
          </div>

          {/* Result rows */}
          <div className="divide-y divide-gray-50">
            {applyFiltersSort(smartResults, "all", sortBy, sizeFilter).map((ds) => {
              const key        = `${ds.source}:${ds.ref}`;
              const selected   = selectedSmartIds.has(key);
              const isExpanded = expandedExtIds.has(key);
              const colState   = extColCache[key];
              const c          = SOURCE_COLORS[ds.source] ?? SOURCE_COLORS["kaggle"];
              return (
                <div key={key} className={`transition-colors ${selected ? "bg-gray-50" : ""}`}>
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Checkbox */}
                    <div
                      onClick={() => setSelectedSmartIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })}
                      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors
                        ${selected ? "bg-gray-800 border-gray-800" : "border-gray-300 hover:border-gray-400"}`}
                    >
                      {selected && (
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Source dot */}
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800 truncate">{ds.title}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${c.badge} ${c.text} flex-shrink-0`}>
                          {ds.sourceLabel}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {ds.size}{ds.downloadCount > 0 ? ` · ${ds.downloadCount.toLocaleString()} downloads` : ""}
                        {ds.lastUpdated ? ` · Updated ${ds.lastUpdated}` : ""}
                      </p>
                    </div>

                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpandExt(key)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                      title={isExpanded ? "Collapse" : "Preview real data"}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {/* Expanded preview panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/60 space-y-3">
                      {/* Description */}
                      {(ds as any).description
                        ? <p className="text-xs text-gray-600 leading-relaxed">{(ds as any).description}</p>
                        : <p className="text-xs text-gray-400 italic">No description available.</p>
                      }

                      {/* Column preview */}
                      {!colState && (
                        <button
                          onClick={() => loadExtColumns(ds, key)}
                          className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-1"
                        >
                          <ChevronRight className="w-3 h-3" /> Preview real data columns
                        </button>
                      )}
                      {colState === "loading" && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Loading columns…
                        </div>
                      )}
                      {colState === "error" && (
                        <p className="text-xs text-red-400">Could not load preview.</p>
                      )}
                      {colState && colState !== "loading" && colState !== "error" && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            Real columns — AI will build on these
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {colState.cols.map((col) => (
                              <span key={col.name} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-700">
                                <span className="font-medium">{col.name}</span>
                                <span className="text-gray-400">{col.type}</span>
                              </span>
                            ))}
                          </div>
                          {colState.sample.length > 0 && (
                            <div className="overflow-x-auto rounded border border-gray-200">
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="bg-gray-100 border-b border-gray-200">
                                    {colState.cols.map((c) => (
                                      <th key={c.name} className="px-2 py-1 text-left font-semibold text-gray-500 whitespace-nowrap">{c.name}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {colState.sample.slice(0, 3).map((row, i) => (
                                    <tr key={i} className="border-b border-gray-100 last:border-0">
                                      {colState.cols.map((c) => (
                                        <td key={c.name} className="px-2 py-1 text-gray-600 whitespace-nowrap max-w-[120px] truncate">
                                          {row[c.name] == null ? <span className="text-gray-300 italic">null</span> : String(row[c.name])}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Use this as base button */}
                      <button
                        onClick={() => {
                          setSelectedSmartIds(new Set([key]));
                          handleSmartSelect(ds);
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-800 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Use as AI base — generate schema from this
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {selectedSmartIds.size === 0
                ? "Select a dataset to continue"
                : selectedSmartIds.size === 1
                  ? "1 dataset selected"
                  : `${selectedSmartIds.size} datasets selected — will be merged`}
            </p>
            <div className="flex items-center gap-2">
              {selectedSmartIds.size === 1 && (() => {
                const picked = smartResults.find((ds) => selectedSmartIds.has(`${ds.source}:${ds.ref}`));
                return picked ? (
                  <button
                    onClick={() => handleSmartSelect(picked)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Use Dataset
                  </button>
                ) : null;
              })()}
              {selectedSmartIds.size >= 2 && (
                <button
                  onClick={handleMergeSelected}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition-colors">
                  <Layers className="w-3.5 h-3.5" /> Merge {selectedSmartIds.size} Datasets
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OR divider */}
      {(phase === "idle" || phase === "results") && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">OR USE AN EXTERNAL DATASET</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}

      {/* ── Import user CSV ── */}
      {(phase === "idle" || phase === "results") && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Import Your Own Dataset</p>
              <p className="text-xs text-gray-400">Upload a CSV file — system analyzes its columns and types automatically</p>
            </div>
            <span className="text-xs text-green-700 font-medium border border-green-200 rounded-full px-3 py-1 bg-green-50 group-hover:bg-green-100 transition-colors">
              Choose CSV
            </span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadDataset(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {/* ── Dataset source search ── */}
      {(phase === "idle" || phase === "results") && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">

          {/* Header */}
          <div>
            <p className="text-sm font-semibold text-gray-800">Search Dataset Sources</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Searches Kaggle, Hugging Face, UCI, OpenML, Data.gov.ph &amp; PSA simultaneously
            </p>
          </div>

          {/* Search bar */}
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. employee salary, student records, medical diagnosis…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              <Search className="w-4 h-4" /> Search
            </button>
          </div>

          {/* Source filter chips + sort/size controls — appear after results load */}
          {phase === "results" && searchResults.length > 0 && (() => {
            const activeSources = Array.from(new Set(searchResults.map((r) => r.source).filter(Boolean)));
            return (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Filter by source</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setExtSourceFilter("all")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                      ${extSourceFilter === "all"
                        ? "bg-gray-800 text-white border-gray-800"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    All
                    <span className="ml-1.5 opacity-60">{searchResults.length}</span>
                  </button>
                  {activeSources.map((srcId) => {
                    const c = SOURCE_COLORS[srcId] ?? SOURCE_COLORS["kaggle"];
                    const src = DATA_SOURCES.find((s) => s.id === srcId);
                    const count = searchResults.filter((r) => r.source === srcId).length;
                    const active = extSourceFilter === srcId;
                    return (
                      <button
                        key={srcId}
                        onClick={() => setExtSourceFilter(srcId)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all
                          ${active
                            ? `${c.activeBg} ${c.activeText} border-transparent shadow-sm`
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-white/70" : c.dot}`} />
                        {src?.label ?? srcId}
                        <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sort + size filter row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Sort &amp; filter:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="downloads">Most downloaded</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="rows_desc">Most rows</option>
                    <option value="rows_asc">Fewest rows</option>
                    <option value="alpha">A – Z</option>
                  </select>
                  <select
                    value={sizeFilter}
                    onChange={(e) => setSizeFilter(e.target.value as typeof sizeFilter)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="any">Any size</option>
                    <option value="small">Small (&lt; 1K rows)</option>
                    <option value="medium">Medium (1K – 50K rows)</option>
                    <option value="large">Large (50K+ rows)</option>
                  </select>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Loading / Generating ── */}
      {(phase === "loading" || phase === "generating") && (
        <GeneratingLoader
          phase={phase === "generating" ? "generating" : "loading"}
          message={loadingMsg || undefined}
        />
      )}

      {/* ── Search results ── */}
      {phase === "results" && (() => {
        const filtered = applyFiltersSort(searchResults, extSourceFilter, sortBy, sizeFilter);
        return (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-sm font-medium text-gray-700">
                {filtered.length} dataset{filtered.length !== 1 ? "s" : ""}
                {extSourceFilter !== "all" && (
                  <span className="text-gray-400 font-normal"> from {DATA_SOURCES.find((s) => s.id === extSourceFilter)?.label}</span>
                )}
              </span>
              <button onClick={() => { setPhase("idle"); setSearchResults([]); setExtSourceFilter("all"); setSelectedExtIds(new Set()); setExpandedExtIds(new Set()); }}
                className="text-xs text-gray-400 hover:text-gray-600">← New search</button>
            </div>

            {filtered.length === 0
              ? <p className="p-6 text-sm text-gray-400 text-center">No datasets from this source.</p>
              : <div className="divide-y divide-gray-50">
                  {filtered.map((ds) => {
                    const key = `${ds.source}:${ds.ref}`;
                    const c = SOURCE_COLORS[ds.source] ?? SOURCE_COLORS["kaggle"];
                    const srcLabel = ds.sourceLabel ?? DATA_SOURCES.find((s) => s.id === ds.source)?.label ?? ds.source;
                    const isExpanded = expandedExtIds.has(key);
                    const isSelected = selectedExtIds.has(key);
                    const colState   = extColCache[key];
                    return (
                      <div key={key} className={`transition-colors ${isSelected ? "bg-purple-50/40" : ""}`}>
                        {/* Main row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Checkbox */}
                          <div
                            onClick={() => toggleSelectExt(key)}
                            className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors
                              ${isSelected ? "bg-gray-800 border-gray-800" : "border-gray-300 hover:border-gray-400"}`}
                          >
                            {isSelected && (
                              <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                                <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>

                          {/* Source dot */}
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />

                          {/* Info — clicking the text area selects this dataset */}
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSelectDataset(ds)}>
                            <p className="text-sm font-medium text-gray-800 truncate">{ds.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              <span className={`font-medium ${c.text}`}>{srcLabel}</span>
                              {ds.size ? ` · ${ds.size}` : ""}
                              {(ds as any).downloadCount ? ` · ${(ds as any).downloadCount.toLocaleString()} downloads` : ""}
                              {ds.lastUpdated ? ` · Updated ${ds.lastUpdated}` : ""}
                            </p>
                          </div>

                          {/* Expand toggle */}
                          <button
                            onClick={() => toggleExpandExt(key)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                            title={isExpanded ? "Collapse" : "Preview dataset"}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        {/* Expanded preview panel */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/60 space-y-3">
                            {/* Description */}
                            {(ds as any).description
                              ? <p className="text-xs text-gray-600 leading-relaxed">{(ds as any).description}</p>
                              : <p className="text-xs text-gray-400 italic">No description available.</p>
                            }

                            {/* Column preview */}
                            {!colState && (
                              <button
                                onClick={() => loadExtColumns(ds, key)}
                                className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-1"
                              >
                                <ChevronRight className="w-3 h-3" /> Load column preview
                              </button>
                            )}
                            {colState === "loading" && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Loading columns…
                              </div>
                            )}
                            {colState === "error" && (
                              <p className="text-xs text-red-400">Could not load preview.</p>
                            )}
                            {colState && colState !== "loading" && colState !== "error" && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {colState.cols.map((col) => (
                                    <span key={col.name} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-700">
                                      <span className="font-medium">{col.name}</span>
                                      <span className="text-gray-400">{col.type}</span>
                                    </span>
                                  ))}
                                </div>
                                {colState.sample.length > 0 && (
                                  <div className="overflow-x-auto rounded border border-gray-200">
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="bg-gray-100 border-b border-gray-200">
                                          {colState.cols.map((c) => (
                                            <th key={c.name} className="px-2 py-1 text-left font-semibold text-gray-500 whitespace-nowrap">{c.name}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {colState.sample.slice(0, 3).map((row, i) => (
                                          <tr key={i} className="border-b border-gray-100 last:border-0">
                                            {colState.cols.map((c) => (
                                              <td key={c.name} className="px-2 py-1 text-gray-600 whitespace-nowrap max-w-[120px] truncate">
                                                {row[c.name] == null ? <span className="text-gray-300 italic">null</span> : String(row[c.name])}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Quick-use button */}
                            <button
                              onClick={() => handleSelectDataset(ds)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 hover:text-purple-700 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" /> Use this dataset
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
            }

            {/* Action bar — shown when items are selected */}
            {selectedExtIds.size > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {selectedExtIds.size === 1
                    ? "1 dataset selected"
                    : `${selectedExtIds.size} datasets selected — will be combined`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedExtIds(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                  >
                    Clear
                  </button>
                  {selectedExtIds.size === 1 && (() => {
                    const picked = searchResults.find((ds) => selectedExtIds.has(`${ds.source}:${ds.ref}`));
                    return picked ? (
                      <button
                        onClick={() => handleSelectDataset(picked)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Use Dataset
                      </button>
                    ) : null;
                  })()}
                  {selectedExtIds.size >= 2 && (
                    <button
                      onClick={handleCombineExtDatasets}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition-colors"
                    >
                      <Layers className="w-3.5 h-3.5" /> Combine {selectedExtIds.size} Datasets
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Error ── */}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-700 font-medium">Something went wrong</p>
            <p className="text-xs text-red-500 mt-0.5">{sanitizeErrorMsg(errorMsg)}</p>
            <button onClick={() => { setErrorMsg(""); setPhase(tables.length > 0 ? "schema" : "idle"); }} className="mt-2 text-xs text-red-500 underline">
              {tables.length > 0 ? "Back to Schema" : "Try again"}
            </button>
          </div>
        </div>
      )}

      {/* ── Template Preview (LLM mode step 2) ── */}
      {phase === "template_preview" && (
        <div className="space-y-4">

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
              <span className="text-xs font-medium text-purple-700">Schema</span>
            </div>
            <div className="flex-1 h-px bg-purple-200" />
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
              <span className="text-xs font-medium text-purple-700">Template</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-400 text-[10px] font-bold">3</div>
              <span className="text-xs text-gray-400">Generate</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Template Rows", value: "200", sub: "AI-generated seed" },
              { label: "Columns",       value: String(templateColumns.length), sub: "from your schema" },
              { label: "Target Rows",   value: rowCount.toLocaleString(), sub: "set below" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-gray-900">{s.value}</p>
                <p className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</p>
                <p className="text-[11px] text-gray-400">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Data Preview</p>
                <p className="text-xs text-gray-400 mt-0.5">First 10 of 200 generated template rows</p>
              </div>
              <span className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-full font-medium">
                ✦ AI Generated
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {templateColumns.map((col) => (
                      <th key={col} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap tracking-wide uppercase text-[10px]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {templatePreviewRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-purple-50/30 transition-colors">
                      {templateColumns.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                          {row[col] === null || row[col] === undefined
                            ? <span className="text-gray-300 italic text-[10px]">null</span>
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Entity master tables */}
          {entityTables.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-800">Related Entity Tables</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  These master tables were automatically generated to ensure FK consistency.
                  They will be available as separate CSV downloads after generation.
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {entityTables.map((et) => (
                  <div key={et.name} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700 capitalize">{et.name}_master</span>
                        <span className="text-[10px] text-gray-400">{et.rows} records · {(et.columns ?? []).length} columns</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium border border-blue-100">
                        {(et.columns ?? []).join(", ")}
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded border border-gray-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {(et.columns ?? []).map((c) => (
                              <th key={c} className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {et.preview.map((row, i) => (
                            <tr key={i} className="border-b border-gray-50 last:border-0">
                              {(et.columns ?? []).map((c) => (
                                <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                                  {row[c] == null ? <span className="text-gray-300 italic">null</span> : String(row[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row count + expand */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Scale up with CTGAN</p>
              <p className="text-xs text-gray-500 mt-0.5">
                CTGAN will train on the 200-row template and generate a statistically similar dataset at your chosen size.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Final Row Count</span>
                <span className="text-sm font-bold text-purple-700">{rowCount.toLocaleString()} rows</span>
              </div>
              <input type="range" min={1_000} max={100_000} step={1_000}
                value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}
                className="w-full accent-purple-600" />
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>1,000</span>
                <span>50,000</span>
                <span>100,000</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setPhase("schema")}
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                ← Back
              </button>
              <button onClick={handleDownloadTemplate}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-purple-200 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors">
                Preview 200-row Template
              </button>
              <button onClick={handleExpand}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm">
                <Layers className="w-4 h-4" />
                Generate {rowCount.toLocaleString()} Rows → Preview
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── Multi-table Preview (step before ZIP download) ── */}
      {phase === "multi_preview" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Data Preview — {multiPreviewTables.length} tables</p>
                <p className="text-xs text-gray-400 mt-0.5">First 10 rows of each table. Review before downloading.</p>
              </div>
              <button
                onClick={() => setPhase("schema")}
                className="text-xs text-gray-400 hover:text-gray-700 underline font-medium">
                ← Back to Schema
              </button>
            </div>

            {/* Table tabs */}
            <div className="flex overflow-x-auto border-b border-gray-100">
              {multiPreviewTables.map((t, i) => (
                <button
                  key={t.name}
                  onClick={() => setMultiPreviewActiveTab(i)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-r border-gray-100 transition-colors relative flex-shrink-0
                    ${multiPreviewActiveTab === i ? "bg-purple-50 text-purple-700" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {multiPreviewActiveTab === i && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />
                  )}
                  {t.name}
                  <span className="ml-1.5 text-[10px] text-gray-400">{(t.columns ?? []).length} cols</span>
                </button>
              ))}
            </div>

            {/* Preview table */}
            {multiPreviewTables[multiPreviewActiveTab] && (() => {
              const { columns, rows } = multiPreviewTables[multiPreviewActiveTab];
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {columns.map((col) => (
                          <th key={col} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap tracking-wide uppercase text-[10px]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-purple-50/30 transition-colors">
                          {columns.map((col) => (
                            <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                              {row[col] === null || row[col] === undefined
                                ? <span className="text-gray-300 italic text-[10px]">null</span>
                                : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Row count + confirm */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Rows per table</p>
                <p className="text-xs text-gray-400">Set how many rows to generate for each table</p>
              </div>
              <span className="text-sm font-bold text-purple-700">{rowCount.toLocaleString()}</span>
            </div>
            <input type="range" min={100} max={100000} step={100}
              value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}
              className="w-full accent-purple-600" />

            {/* Format selector */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Download format</p>
              <div className="flex gap-2">
                {(["csv", "json", "xlsx"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setDownloadFormat(fmt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${downloadFormat === fmt
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600"}`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConfirmDownloadZip}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm">
              <Download className="w-4 h-4" />
              Looks good — Download {tables.length} Tables as {downloadFormat === "xlsx" ? "Excel" : downloadFormat.toUpperCase()}
            </button>
          </div>
        </div>
      )}

      {/* Table tabs — shown when 2+ tables */}
      {phase === "schema" && tables.length >= 2 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center overflow-x-auto">
            {tables.map((t) => {
              const isActive = t.id === (tables.find((x) => x.id === activeTableId) ?? tables[0]).id;
              return (
                <button key={t.id}
                  onClick={() => setActiveTableId(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-r border-gray-100 whitespace-nowrap transition-colors flex-shrink-0 relative
                    ${isActive ? "bg-purple-50 text-purple-700" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />}
                  <span className="truncate max-w-[120px]">{t.name}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); removeTable(t.id); }}
                    className="ml-1.5 text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
            <button onClick={addTable}
              className="flex items-center gap-1 px-3 py-2.5 text-xs text-gray-400 hover:text-purple-600 transition-colors ml-auto flex-shrink-0 border-l border-gray-100">
              <Plus className="w-3.5 h-3.5" /> Add Table
            </button>
          </div>
        </div>
      )}

      {/* ── Schema editor ── */}
      {phase === "schema" && tables.length > 0 && (() => {
        const table = tables.find((t) => t.id === activeTableId) ?? tables[0];
        return (
        <div key={table.id} className="space-y-4">

          <div className="flex items-center justify-between">
            {(() => {
              const hasLlm    = table.fields.some((f) => f.llmGenerated);
              const hasMerged = table.fields.some((f) => f.mergedFrom);
              const tags: JSX.Element[] = [];
              if (hasMerged)  tags.push(<span key="m" className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-800 text-white">Merged Datasets</span>);
              else            tags.push(<span key="r" className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Real Dataset</span>);
              if (hasLlm)     tags.push(<span key="a" className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">AI Augmented</span>);
              if (mode === "llm" && !hasMerged && !hasLlm)
                              return <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">AI Generated Schema</span>;
              return <div className="flex items-center gap-1.5">{tags}</div>;
            })()}
            <button
              onClick={() => {
                sessionStorage.removeItem("schema_builder_draft");
                setTables([]);
                setActiveTableId("");
                setPhase("idle");
                setSearchQuery("");
                setSearchResults([]);
                setSaveStatus("idle");
              }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              ← Start Over
            </button>
          </div>

          {/* Field table */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Layers className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <input
                  value={table.name}
                  onChange={(e) => updateTableName(table.id, e.target.value)}
                  className="text-sm font-semibold text-gray-800 bg-transparent focus:outline-none focus:underline min-w-0 flex-1"
                  title="Click to rename table"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">({table.fields.length} fields)</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {changedCount > 0 && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {changedCount} change{changedCount !== 1 ? "s" : ""}
                  </span>
                )}
                {tables.length === 1 && (
                  <button onClick={addTable}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors border border-gray-200 rounded-lg px-2 py-1">
                    <Plus className="w-3 h-3" /> Add Table
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="w-8 py-2 px-3" />
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-400">Field Name</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-400">Null %</th>
                  {mode === "kaggle" && (
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-400">Sample</th>
                  )}
                  <th className="w-16 py-2 px-3 text-xs font-medium text-gray-400 text-center">Details</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {table.fields.map((field) => {
                  const origField = originalSchema.find((o) => o.name === field.originalName);
                  const changed   = mode === "kaggle" && isChanged(field) && !field.llmGenerated;
                  const rowBg = field.expanded
                    ? "bg-purple-50/30"
                    : field.llmGenerated
                      ? "bg-yellow-50/70"
                      : field.mergedFrom
                        ? "bg-blue-50/50"
                        : changed
                          ? "bg-amber-50"
                          : "hover:bg-gray-50";
                  return (
                    <Fragment key={field.id}>
                      <tr className={`border-b border-gray-50 transition-colors ${rowBg}`}>
                        <td className="py-2 px-3 text-gray-300">
                          <GripVertical className="w-3.5 h-3.5" />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-0.5 min-w-[140px]">
                            <div className="flex items-center gap-1.5">
                              <input value={field.name}
                                onChange={(e) => updateField(table.id, field.id, { name: e.target.value })}
                                className="text-sm bg-transparent focus:outline-none text-gray-800 flex-1 min-w-0" />
                              {field.llmGenerated && (
                                <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-200 text-yellow-800 border border-yellow-300 whitespace-nowrap">
                                  AI Added
                                </span>
                              )}
                              {field.mergedFrom && (
                                <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
                                  {field.mergedFrom}
                                </span>
                              )}
                              {field.fk_table && field.fk_field && (
                                <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 whitespace-nowrap">
                                  FK → {field.fk_table}.{field.fk_field}
                                </span>
                              )}
                            </div>
                            <input value={field.description}
                              onChange={(e) => updateField(table.id, field.id, { description: e.target.value })}
                              placeholder="Describe this field…"
                              className="text-[11px] bg-transparent focus:outline-none text-gray-400 placeholder-gray-300 w-full" />
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <select value={field.type}
                            onChange={(e) => updateField(table.id, field.id, { type: e.target.value, constraints: emptyConstraints() })}
                            className="text-xs bg-gray-100 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 text-gray-700">
                            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <input type="range" min={0} max={50} step={1}
                              value={field.null_rate}
                              onChange={(e) => updateField(table.id, field.id, { null_rate: Number(e.target.value) })}
                              className="w-16 accent-purple-600" />
                            <span className={`text-xs tabular-nums w-7 ${field.null_rate > 20 ? "text-amber-600" : "text-gray-500"}`}>
                              {field.null_rate}%
                            </span>
                          </div>
                        </td>
                        {mode === "kaggle" && (
                          <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate">
                            {origField?.sample_values?.join(", ") ?? ""}
                          </td>
                        )}
                        <td className="py-2 px-3 text-center">
                          <button onClick={() => toggleExpanded(table.id, field.id)}
                            className={`flex items-center gap-0.5 text-xs mx-auto transition-colors
                              ${field.expanded ? "text-purple-600" : "text-gray-400 hover:text-purple-500"}`}>
                            {field.expanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>{field.expanded ? "Less" : "More"}</span>
                          </button>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => removeField(table.id, field.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {field.expanded && renderConstraints(table, field)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="px-4 py-2 border-t border-gray-50">
              <button onClick={() => addField(table.id)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-purple-600 transition-colors py-1">
                <Plus className="w-3.5 h-3.5" /> Add field
              </button>
            </div>
          </div>

          {/* Field origin legend */}
          {(table.fields.some((f) => f.llmGenerated) || table.fields.some((f) => f.mergedFrom)) && (
            <div className="space-y-1.5">
              {table.fields.some((f) => f.mergedFrom) && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Merged fields</strong> (blue) came from other selected datasets whose columns didn't overlap with the primary dataset.
                    Values are generated using smart schema rules based on field name and type.
                  </span>
                </div>
              )}
              {table.fields.some((f) => f.llmGenerated) && (
                <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5 text-xs text-yellow-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>AI-added fields</strong> (yellow) were automatically detected from your description — they were missing from the real dataset.
                    Generated using smart schema rules, not hallucinated values. Fully editable.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Row count + Save + Generate */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">

            {/* Per-table row count when 2+ tables */}
            {tables.length >= 2 && (
              <div className="flex items-center gap-3 pb-1 border-b border-gray-50">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Rows for <span className="text-purple-700 font-semibold">{table.name}</span>
                </span>
                <input type="range" min={100} max={100_000} step={100}
                  value={table.rowCount ?? rowCount}
                  onChange={(e) => updateTableRowCount(table.id, Number(e.target.value))}
                  className="flex-1 accent-purple-600" />
                <span className="text-xs font-semibold text-purple-700 w-20 text-right tabular-nums">
                  {(table.rowCount ?? rowCount).toLocaleString()}
                </span>
              </div>
            )}

            {/* Row count slider — only shown for Kaggle/CTGAN mode with single table */}
            {mode === "kaggle" && tables.length === 1 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Row Count</span>
                <input type="range" min={1_000} max={100_000} step={1_000}
                  value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}
                  className="flex-1 accent-purple-600" />
                <span className="text-xs font-semibold text-purple-700 w-20 text-right tabular-nums">
                  {rowCount.toLocaleString()}
                </span>
              </div>
            )}

            {mode === "llm" && tables.length === 1 && (
              <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                ✦ A 200-row template will be generated first. You'll set the final row count before CTGAN scales it up.
              </p>
            )}

            {/* Single-table actions */}
            {tables.length === 1 && (
              <div className="flex items-center gap-2 pt-1">
                <button onClick={handleSaveSchema} disabled={saveStatus === "saving"}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                    ${saveStatus === "saved"  ? "border-green-400 text-green-600 bg-green-50" :
                      saveStatus === "error"  ? "border-red-400 text-red-600 bg-red-50"   :
                                                "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  <Save className="w-4 h-4" />
                  {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Failed" : "Save Schema"}
                </button>

                {mode === "llm" ? (
                  <button onClick={handleLlmGenerateAndPreview}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                    <Sparkles className="w-4 h-4" /> Generate → Preview
                  </button>
                ) : datasetId ? (
                  <button onClick={() => handleGenerate()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                    Generate with CTGAN
                  </button>
                ) : kaggleRef ? (
                  <button onClick={handleRedownload}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                    Regenerate Dataset
                  </button>
                ) : (
                  <button onClick={handleRedownload} disabled
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
                    Regenerate Dataset
                  </button>
                )}
              </div>
            )}

            {/* Multi-table actions */}
            {tables.length >= 2 && (
              <div className="space-y-2 pt-1">
                <button onClick={handlePreviewMultiTable}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm">
                  <Download className="w-4 h-4" />
                  Preview &amp; Generate All {tables.length} Tables
                </button>
                <p className="text-[11px] text-gray-400 text-center">
                  Preview sample rows first, then download as ZIP
                </p>
              </div>
            )}

          </div>
        </div>
        );
      })()}
    </div>
  );
}
