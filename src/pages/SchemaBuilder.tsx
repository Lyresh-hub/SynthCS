import { useState, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import {
  Plus, Trash2, GripVertical, Layers,
  Search, Download, RefreshCw, AlertCircle, Save, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";

import { NODE_API, PYTHON_API } from "../lib/config";

const FIELD_TYPES = [
  "string", "integer", "float", "boolean",
  "date", "email", "uuid", "phone", "address", "name", "ip",
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
}

interface Table { id: string; name: string; fields: Field[]; }

interface KaggleDataset {
  ref: string; title: string; size: string;
  lastUpdated: string; downloadCount: number; description: string;
}

interface OriginalField {
  name: string; type: string; nullable: boolean; sample_values?: string[];
}

type Phase = "idle" | "results" | "loading" | "schema" | "template_preview" | "generating" | "error";
type Mode  = "kaggle" | "llm";

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchemaBuilder() {
  const [, setLocation] = useLocation();

  const [phase, setPhase]           = useState<Phase>("idle");
  const [mode, setMode]             = useState<Mode>("kaggle");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [errorMsg, setErrorMsg]     = useState("");

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<KaggleDataset[]>([]);

  const [llmPrompt, setLlmPrompt]   = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError]     = useState("");

  const [templateDatasetId,   setTemplateDatasetId]   = useState("");
  const [templateColumns,     setTemplateColumns]     = useState<string[]>([]);
  const [templatePreviewRows, setTemplatePreviewRows] = useState<Record<string, unknown>[]>([]);

  const [datasetId, setDatasetId]           = useState("");
  const [kaggleRef, setKaggleRef]           = useState("");
  const [originalSchema, setOriginalSchema] = useState<OriginalField[]>([]);
  const [tables, setTables]                 = useState<Table[]>([]);
  const [rowCount, setRowCount]             = useState(10_000);

  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [aiFieldLoading, setAiFieldLoading] = useState<string | null>(null);

  // ── Load saved schema from URL ────────────────────────────────────────────
  const loadSchemaId = new URLSearchParams(window.location.search).get("load");

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

  const isChanged = (field: Field): boolean => {
    const orig = originalSchema.find((o) => o.name === field.originalName);
    if (!orig) return true;
    return field.name !== orig.name || field.type !== orig.type;
  };

  // ── LLM ──────────────────────────────────────────────────────────────────

  const handleLlmGenerate = async () => {
    if (!llmPrompt.trim()) return;
    setLlmLoading(true);
    setLlmError("");
    try {
      const res  = await fetch(`${NODE_API}/api/llm/generate-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: llmPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "LLM request failed");

      const fields: Field[] = data.fields.map((f: any, i: number) =>
        makeField({
          id:           `llm${i}`,
          name:         f.name,
          type:         f.type,
          null_rate:    typeof f.null_rate === "number" ? Math.round(Math.min(50, Math.max(0, f.null_rate))) : 0,
          originalName: f.name,
          originalType: f.type,
          description:  f.description ?? "",
          constraints: (() => {
            const c = f.constraints ?? {};
            const ev = c.enum_values;
            return {
              ...c,
              enum_values: Array.isArray(ev) ? ev.join(", ") : (ev ?? undefined),
            };
          })(),
          expanded:     false,
        })
      );

      setOriginalSchema(data.fields.map((f: any) => ({ name: f.name, type: f.type, nullable: false })));
      setTables([{ id: "1", name: data.table_name, fields }]);
      setDatasetId(""); setKaggleRef(""); setMode("llm"); setPhase("schema");
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
        setLlmError("Cannot reach the backend. Make sure the Node server is running on port 5000.");
      } else if (msg.includes("401") || msg.toLowerCase().includes("authentication") || msg.toLowerCase().includes("invalid x-api-key")) {
        setLlmError("Anthropic API key is invalid or expired. Update ANTHROPIC_API_KEY in backend/.env and restart the server.");
      } else if (msg.toLowerCase().includes("credit") || msg.includes("402")) {
        setLlmError("Anthropic account has insufficient credits. Top up at console.anthropic.com.");
      } else if (msg.toLowerCase().includes("model")) {
        setLlmError("The AI model could not be reached. Try again in a moment.");
      } else {
        setLlmError(msg || "Schema generation failed. Please try again.");
      }
    } finally {
      setLlmLoading(false);
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

  // ── Kaggle ────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoadingMsg("Searching Kaggle…"); setPhase("loading");
    try {
      const res = await fetch(`${PYTHON_API}/api/kaggle/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSearchResults((await res.json()).datasets ?? []);
      setPhase("results");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Search failed. Is the Python service running on port 8000?");
      setPhase("error");
    }
  };

  const handleSelectDataset = async (ds: KaggleDataset) => {
    setKaggleRef(ds.ref);
    setLoadingMsg(`Downloading "${ds.title}" from Kaggle…`); setPhase("loading");
    try {
      const res  = await fetch(`${PYTHON_API}/api/kaggle/download`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_ref: ds.ref }),
      });
      if (!res.ok) throw new Error(await res.text());
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

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSaveSchema = async () => {
    if (!tables[0]) return;
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`${NODE_API}/api/schemas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          name: tables[0].name,
          table_name: tables[0].name,
          fields: tables[0].fields.map((f) => ({ name: f.name, type: f.type, nullable: f.null_rate > 0 })),
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
    if (!tables[0]) return;
    setLoadingMsg("Generating 200-row template via schema…");
    setPhase("generating");
    try {
      const payload = {
        table_name: tables[0].name,
        fields: tables[0].fields.map((f) => ({
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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTemplateDatasetId(data.dataset_id);
      setTemplateColumns(data.columns);
      setTemplatePreviewRows(data.preview);
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
      const res = await fetch(`${PYTHON_API}/api/expand-with-ctgan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: templateDatasetId, row_count: rowCount }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const userId = localStorage.getItem("user_id");
      if (userId) {
        await fetch(`${NODE_API}/api/datasets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name: tables[0]?.name ?? "dataset", kaggle_ref: "", python_dataset_id: data.dataset_id, row_count: rowCount }),
        }).catch(() => {});
      }
      sessionStorage.setItem("preview_params", JSON.stringify({ id: data.dataset_id, name: tables[0]?.name ?? "dataset", rows: rowCount, ref: "" }));
      setLocation("/preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "CTGAN expansion failed."); setPhase("error");
    }
  };

  // ── Generate (Kaggle/CTGAN mode only) ────────────────────────────────────

  const handleGenerate = async () => {
    if (!tables[0]) return;

    // CTGAN mode
    if (!datasetId) return;
    setLoadingMsg(`Training CTGAN · generating ${rowCount.toLocaleString()} rows…`);
    setPhase("generating");
    const changes = tables[0].fields.map((f) => ({
      original_name: f.originalName || f.name,
      new_name:      f.name,
      original_type: f.originalType || f.type,
      new_type:      f.type,
      nullable:      f.null_rate > 0,
    }));
    try {
      const res = await fetch(`${PYTHON_API}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: datasetId, changes, row_count: rowCount }),
      });
      if (!res.ok) throw new Error(await res.text());

      const userId = localStorage.getItem("user_id");
      if (userId) {
        await fetch(`${NODE_API}/api/datasets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name: tables[0].name, kaggle_ref: kaggleRef, python_dataset_id: datasetId, row_count: rowCount }),
        }).catch(() => {});
      }
      sessionStorage.setItem("preview_params", JSON.stringify({ id: datasetId, name: tables[0].name, rows: rowCount, ref: kaggleRef }));
      setLocation("/preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Generation failed. Check the Python service logs."); setPhase("error");
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

            {/* Type-specific */}
            {panel && (
              <div>
                <p className={labelClass + " mb-2"}>
                  {field.type === "string"  ? "Value constraints" :
                   field.type === "boolean" ? "Distribution" :
                   field.type === "date"    ? "Date range" :
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
    ? (tables[0]?.fields.filter(isChanged).length ?? 0)
    : 0;

  return (
    <div className="space-y-4">

      {/* ── LLM panel ── */}
      {phase !== "loading" && phase !== "generating" && (
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
              {llmLoading ? "Generating…" : "Generate Schema"}
            </button>
          </div>
          {llmError && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">{llmError}</p>
            </div>
          )}
        </div>
      )}

      {/* OR divider */}
      {(phase === "idle" || phase === "results") && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">OR USE KAGGLE DATASET</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}

      {/* ── Kaggle search ── */}
      {phase === "idle" && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-medium text-gray-700">
            Search Kaggle for an existing dataset to use as CTGAN training data
          </p>
          <div className="flex gap-2">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. titanic, diabetes, house prices…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <button onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors">
              <Search className="w-4 h-4" /> Search
            </button>
          </div>
        </div>
      )}

      {/* ── Loading / Generating ── */}
      {(phase === "loading" || phase === "generating") && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 shadow-sm flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-purple-600 animate-spin" />
          <p className="text-sm font-medium text-gray-700">{loadingMsg}</p>
          {phase === "generating" && <p className="text-xs text-gray-400">This may take a few minutes.</p>}
        </div>
      )}

      {/* ── Search results ── */}
      {phase === "results" && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              {searchResults.length} dataset{searchResults.length !== 1 ? "s" : ""} found
            </span>
            <button onClick={() => setPhase("idle")} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          </div>
          {searchResults.length === 0
            ? <p className="p-6 text-sm text-gray-400 text-center">No datasets found.</p>
            : <div className="divide-y divide-gray-50">
                {searchResults.map((ds) => (
                  <button key={ds.ref} onClick={() => handleSelectDataset(ds)}
                    className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{ds.title}</p>
                      <p className="text-xs text-gray-400">{ds.ref} · {ds.size} · {ds.downloadCount.toLocaleString()} downloads</p>
                    </div>
                    <Download className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── Error ── */}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-700 font-medium">Something went wrong</p>
            <p className="text-xs text-red-500 mt-0.5">{errorMsg}</p>
            <button onClick={() => { setPhase("idle"); setErrorMsg(""); }} className="mt-2 text-xs text-red-500 underline">
              Try again
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
              <button onClick={handleExpand}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm">
                <Layers className="w-4 h-4" />
                Generate {rowCount.toLocaleString()} Rows with CTGAN
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── Schema editor ── */}
      {phase === "schema" && tables.map((table) => (
        <div key={table.id} className="space-y-4">

          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full
              ${mode === "llm" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {mode === "llm" ? "✦ AI Generated Schema" : "⬡ Kaggle Dataset"}
            </span>
            <button onClick={() => { setPhase("idle"); setSearchQuery(""); setSearchResults([]); setSaveStatus("idle"); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              ← New search
            </button>
          </div>

          {/* Field table */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-800">{table.name}</span>
                <span className="text-xs text-gray-400">({table.fields.length} fields)</span>
              </div>
              {changedCount > 0 && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {changedCount} change{changedCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <table className="w-full text-sm">
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
                  const changed   = mode === "kaggle" && isChanged(field);
                  return (
                    <Fragment key={field.id}>
                      <tr
                        className={`border-b border-gray-50 transition-colors
                          ${field.expanded ? "bg-purple-50/30" : changed ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                        <td className="py-2 px-3 text-gray-300">
                          <GripVertical className="w-3.5 h-3.5" />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-0.5 min-w-[140px]">
                            <input value={field.name}
                              onChange={(e) => updateField(table.id, field.id, { name: e.target.value })}
                              className="text-sm bg-transparent focus:outline-none text-gray-800 w-full" />
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

            <div className="px-4 py-2 border-t border-gray-50">
              <button onClick={() => addField(table.id)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-purple-600 transition-colors py-1">
                <Plus className="w-3.5 h-3.5" /> Add field
              </button>
            </div>
          </div>

          {/* Row count + Save + Generate */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
            {/* Row count slider — only shown for Kaggle/CTGAN mode */}
            {mode === "kaggle" && (
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

            {mode === "llm" && (
              <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                ✦ A 200-row template will be generated first. You'll set the final row count before CTGAN scales it up.
              </p>
            )}

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
                <button onClick={handleGenerateTemplate}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                  <Sparkles className="w-4 h-4" /> Generate Template
                </button>
              ) : (
                <button onClick={handleGenerate}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                  Generate with CTGAN
                </button>
              )}
            </div>

            {changedCount > 0 && mode === "kaggle" && (
              <p className="text-xs text-amber-600">
                {changedCount} field{changedCount !== 1 ? "s" : ""} modified — only those changes will be applied.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
