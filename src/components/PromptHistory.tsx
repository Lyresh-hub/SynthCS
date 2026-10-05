import { useEffect, useMemo, useState } from "react";
import { CLAMP_CHARS } from "./ClampedText";
import {
  Search, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, ShieldAlert, Ban, Database,
  Download, Save, AlertTriangle, Activity, MessageSquare, Filter, X,
} from "lucide-react";

// ── Prompts & Reviews ─────────────────────────────────────────────────────────
// What students ASKED FOR and what came of it: one card per prompt with the
// declared reason (type of data + intended use), the review outcome, the
// datasets used/generated, and whether they downloaded or saved anything.

export interface PromptEntry {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  prompt_text: string;
  started_at: string;
  last_at: string;
  steps: { type: string; label: string; at: string; table_name?: string | null }[];
  prompt_types: string[];
  category: string | null;
  purpose: string | null;
  status: "allowed" | "pending" | "approved" | "rejected" | "blocked";
  review: {
    status: string; reason: string | null; reviewer: string | null; reviewed_at: string | null; flagged_at: string;
    matches: { level: number; term: string; matched: string }[]; ai: string | null;
  } | null;
  datasets: { name: string; rows: number | null; source: string; reference: string | null; locked: boolean; at: string }[];
  downloads: { name: string; format: string; at: string }[];
  saved: { name: string; at: string }[];
  previews: number;
  failures: { stage: string | null; error: string; at: string }[];
  locked_attempts: number;
  triggers?: { level: number; term: string; matched: string }[];
}

export interface PromptFocus { student?: string; text?: string }

const STATUS_META: Record<PromptEntry["status"], { label: string; icon: React.ReactNode; badge: string; border: string }> = {
  allowed:  { label: "Allowed",  icon: <CheckCircle className="w-3 h-3" />, badge: "bg-gray-50 text-gray-600 border-gray-200",     border: "border-gray-100" },
  pending:  { label: "Pending review", icon: <Clock className="w-3 h-3" />, badge: "bg-amber-50 text-amber-700 border-amber-200", border: "border-amber-200" },
  approved: { label: "Approved", icon: <CheckCircle className="w-3 h-3" />, badge: "bg-green-50 text-green-700 border-green-200", border: "border-green-200" },
  rejected: { label: "Rejected", icon: <XCircle className="w-3 h-3" />,     badge: "bg-red-50 text-red-700 border-red-200",       border: "border-red-200" },
  blocked:  { label: "Blocked",  icon: <Ban className="w-3 h-3" />,         badge: "bg-red-100 text-red-800 border-red-300",       border: "border-red-300" },
};

const OUTCOMES = [
  { id: "", label: "Any outcome" },
  { id: "generated", label: "Generated a dataset" },
  { id: "downloaded", label: "Downloaded / exported" },
  { id: "saved", label: "Saved a schema" },
  { id: "nothing", label: "No dataset yet" },
];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function uniq(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

export default function PromptHistory({
  entries, loading, focus, onViewTimeline,
}: {
  entries: PromptEntry[];
  loading: boolean;
  focus?: PromptFocus | null;
  onViewTimeline?: (entry: PromptEntry) => void;
}) {
  const [search, setSearch]     = useState("");
  const [student, setStudent]   = useState("");
  const [status, setStatus]     = useState("");
  const [ptype, setPtype]       = useState("");
  const [category, setCategory] = useState("");
  const [purpose, setPurpose]   = useState("");
  const [source, setSource]     = useState("");
  const [outcome, setOutcome]   = useState("");
  const [open, setOpen]         = useState<string | null>(null);

  // Arriving from the Activity Timeline ("View prompt") narrows to that prompt
  useEffect(() => {
    if (!focus) return;
    setStudent(focus.student ?? "");
    setSearch(focus.text ?? "");
  }, [focus]);

  const options = useMemo(() => ({
    students:   uniq(entries.map((e) => e.student_name)),
    types:      uniq(entries.flatMap((e) => e.prompt_types)),
    categories: uniq(entries.map((e) => e.category)),
    purposes:   uniq(entries.map((e) => e.purpose)),
    sources:    uniq(entries.flatMap((e) => e.datasets.map((d) => d.source))),
  }), [entries]);

  const shown = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (q && !(`${e.prompt_text} ${e.student_name} ${e.student_email}`.toLowerCase().includes(q))) return false;
    if (student && e.student_name !== student) return false;
    if (status && e.status !== status) return false;
    if (ptype && !e.prompt_types.includes(ptype)) return false;
    if (category === "__none" ? !!e.category : category && e.category !== category) return false;
    if (purpose === "__none" ? !!e.purpose : purpose && e.purpose !== purpose) return false;
    if (source && !e.datasets.some((d) => d.source === source)) return false;
    if (outcome === "generated" && e.datasets.length === 0) return false;
    if (outcome === "downloaded" && e.downloads.length === 0) return false;
    if (outcome === "saved" && e.saved.length === 0) return false;
    if (outcome === "nothing" && (e.datasets.length > 0 || e.downloads.length > 0)) return false;
    return true;
  });

  const anyFilter = search || student || status || ptype || category || purpose || source || outcome;
  const clearFilters = () => { setSearch(""); setStudent(""); setStatus(""); setPtype(""); setCategory(""); setPurpose(""); setSource(""); setOutcome(""); };

  const Select = ({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 ${value ? "border-purple-300 text-purple-700" : "border-gray-200 text-gray-600"}`}>
      {children}
    </select>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        What your students <strong>asked for</strong> and what came of it — the reason they gave, whether it was approved,
        the dataset they used, and whether they downloaded or saved anything. Click a card for full details.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prompts, students, emails…"
            className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <Select value={student} onChange={setStudent} label="Student">
            <option value="">All students</option>
            {options.students.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={status} onChange={setStatus} label="Review status">
            <option value="">Any status</option>
            {(["allowed", "pending", "approved", "rejected", "blocked"] as const).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </Select>
          <Select value={ptype} onChange={setPtype} label="Prompt type">
            <option value="">Any prompt type</option>
            {options.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={category} onChange={setCategory} label="Type of data">
            <option value="">Any type of data</option>
            {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__none">Not declared</option>
          </Select>
          <Select value={purpose} onChange={setPurpose} label="Intended use">
            <option value="">Any intended use</option>
            {options.purposes.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__none">Not declared</option>
          </Select>
          <Select value={source} onChange={setSource} label="Dataset source">
            <option value="">Any dataset source</option>
            {options.sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={outcome} onChange={setOutcome} label="Outcome">
            {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
          {anyFilter && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{shown.length} of {entries.length} prompts</span>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-sm text-gray-400">Loading prompts…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-14 flex flex-col items-center gap-2 text-sm text-gray-400">
          <MessageSquare className="w-5 h-5 text-gray-300" />
          {entries.length === 0 ? "No prompts recorded yet." : "No prompts match these filters."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((e) => {
            const st = STATUS_META[e.status];
            const isOpen = open === e.id;
            return (
              <div key={e.id} className={`bg-white rounded-xl border shadow-sm ${st.border}`}>
                {/* Summary */}
                <button onClick={() => setOpen(isOpen ? null : e.id)} className="w-full text-left px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{e.student_name}</span>
                    <span className="text-xs text-gray-400">{e.student_email}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.badge}`}>{st.icon} {st.label}</span>
                    {e.prompt_types.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-purple-50 text-purple-700 border border-purple-100">{t}</span>
                    ))}
                    <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{fmt(e.started_at)}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
                  </div>
                  {/* Closed card: first 4 lines; open card: the whole prompt */}
                  <div className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${isOpen ? "" : "line-clamp-4"}`}>{e.prompt_text}</p>
                    {!isOpen && (e.prompt_text ?? "").length > CLAMP_CHARS && (
                      <span className="mt-1 block text-[11px] font-medium text-purple-600">
                        Open the card to see the full prompt ({e.prompt_text.length.toLocaleString()} characters)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-gray-500">
                      <strong className="text-gray-600">Reason:</strong>{" "}
                      {e.category || e.purpose
                        ? <>{e.category ?? "—"} <span className="text-gray-300">·</span> {e.purpose ?? "—"}</>
                        : <span className="italic text-gray-400">not declared</span>}
                    </span>
                    {e.datasets.length > 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><Database className="w-3 h-3" /> {e.datasets.length} dataset{e.datasets.length === 1 ? "" : "s"} generated</span>}
                    {e.downloads.length > 0 && <span className="inline-flex items-center gap-1 text-blue-700"><Download className="w-3 h-3" /> Downloaded{e.downloads.length > 1 ? ` ×${e.downloads.length}` : ""}</span>}
                    {e.saved.length > 0 && <span className="inline-flex items-center gap-1 text-indigo-700"><Save className="w-3 h-3" /> Schema saved</span>}
                    {e.failures.length > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3" /> {e.failures.length} failed attempt{e.failures.length === 1 ? "" : "s"}</span>}
                  </div>
                </button>

                {/* Details */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <Section title="Reason for the prompt">
                      <Row k="Type of data" v={e.category ?? "Not declared"} />
                      <Row k="Intended use" v={e.purpose ?? "Not declared"} />
                      {!e.category && !e.purpose && (
                        <p className="text-[11px] text-gray-400">The student hasn't answered the purpose questions for this prompt yet (they're asked before generating).</p>
                      )}
                    </Section>

                    <Section title="Review">
                      {e.status === "allowed" ? (
                        <p className="text-gray-600">Not flagged — allowed automatically.</p>
                      ) : e.status === "blocked" ? (
                        <p className="text-red-700">Blocked by one of your class trigger words — the student could not use it.</p>
                      ) : (
                        <>
                          <Row k="Status" v={st.label} />
                          <Row k="Flagged" v={fmt(e.review?.flagged_at ?? e.started_at)} />
                          {e.review?.reviewer && <Row k="Decided by" v={`${e.review.reviewer} · ${fmt(e.review.reviewed_at)}`} />}
                          {e.review?.reason && <Row k="Why flagged" v={e.review.reason} wrap />}
                        </>
                      )}
                      {((e.review?.matches?.length ?? 0) > 0 || (e.triggers?.length ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(e.review?.matches?.length ? e.review.matches : e.triggers ?? []).map((m, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700 text-[10px]">
                              <ShieldAlert className="inline w-3 h-3 mr-0.5" />"{m.term}" ← "{m.matched}" · L{m.level}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.review?.ai && <Row k="AI detection" v={e.review.ai} wrap />}
                    </Section>

                    <Section title="Datasets used / generated">
                      {e.datasets.length === 0 ? (
                        <p className="text-gray-400">No dataset generated from this prompt.</p>
                      ) : e.datasets.map((d, i) => (
                        <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                          <p className="font-medium text-gray-800">{d.name}{d.locked && <span className="ml-1 text-amber-600">🔒 locked for review</span>}</p>
                          <p className="text-gray-500">
                            {d.rows != null ? `${Number(d.rows).toLocaleString()} rows` : "—"} · Source: {d.source}
                            {d.reference && <> · <span className="font-mono">{d.reference}</span></>}
                          </p>
                          <p className="text-[10px] text-gray-400">{fmt(d.at)}</p>
                        </div>
                      ))}
                      {e.previews > 0 && <p className="text-gray-500">Previewed {e.previews} time{e.previews === 1 ? "" : "s"}</p>}
                    </Section>

                    <Section title="Downloads & saved schemas">
                      {e.downloads.length === 0 && e.saved.length === 0 ? (
                        <p className="text-gray-400">Nothing downloaded or saved.</p>
                      ) : (
                        <>
                          {e.downloads.map((d, i) => <Row key={`d${i}`} k={`Downloaded (${d.format})`} v={`${d.name} · ${fmt(d.at)}`} wrap />)}
                          {e.saved.map((s, i) => <Row key={`s${i}`} k="Saved schema" v={`${s.name} · ${fmt(s.at)}`} wrap />)}
                        </>
                      )}
                    </Section>

                    <Section title="Steps">
                      {e.steps.map((s, i) => (
                        <Row key={i} k={fmt(s.at)} v={`${s.label}${s.table_name ? ` — "${s.table_name}"` : ""}`} />
                      ))}
                    </Section>

                    {(e.failures.length > 0 || e.locked_attempts > 0) && (
                      <Section title="Problems">
                        {e.failures.map((f, i) => <Row key={i} k={fmt(f.at)} v={`${f.stage ? `${f.stage}: ` : ""}${f.error}`} wrap />)}
                        {e.locked_attempts > 0 && <Row k="Locked dataset" v={`Tried to open it ${e.locked_attempts} time${e.locked_attempts === 1 ? "" : "s"} before a decision`} />}
                      </Section>
                    )}

                    {onViewTimeline && (
                      <div className="md:col-span-2 flex justify-end">
                        <button onClick={() => onViewTimeline(e)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                          <Activity className="w-3.5 h-3.5" /> View in Activity Timeline →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function Row({ k, v, wrap = false }: { k: string; v: string; wrap?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0 w-32 text-gray-400">{k}</span>
      <span className={`text-gray-700 min-w-0 ${wrap ? "break-words" : "truncate"}`}>{v}</span>
    </div>
  );
}
