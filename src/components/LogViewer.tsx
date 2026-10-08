import { useCallback, useEffect, useState, Fragment } from "react";
import { Info, AlertTriangle, XCircle, RefreshCw, Search, ChevronDown, ChevronUp, Activity, Download } from "lucide-react";

// ── Log explorer (instructor + admin) ────────────────────────────────────────
// Modelled on CloudWatch Logs Insights / Grafana Explore: level counters that
// double as filters, category + time-range + text filters, auto-refresh, and
// expandable rows showing every context field of an event.

export type LogLevel = "INFO" | "WARN" | "ERROR";

type LogEntry = {
  id: string;
  user_id: string | null;
  action_type: string;
  level: LogLevel;
  category: string;
  message: string;
  source: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: "system" | "admin" | "instructor" | "student";
  triggers?: { level: number; term: string; matched: string }[];
};

const LEVEL_STYLE: Record<LogLevel, { label: string; badge: string; card: string; icon: React.ReactNode; row: string }> = {
  INFO:  { label: "Info",    badge: "bg-blue-50 text-blue-700 border-blue-200",   card: "border-blue-200 bg-blue-50/60",   icon: <Info className="w-4 h-4 text-blue-500" />,           row: "" },
  WARN:  { label: "Warning", badge: "bg-amber-50 text-amber-700 border-amber-200", card: "border-amber-200 bg-amber-50/60", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, row: "bg-amber-50/30" },
  ERROR: { label: "Error",   badge: "bg-red-50 text-red-700 border-red-200",       card: "border-red-200 bg-red-50/60",     icon: <XCircle className="w-4 h-4 text-red-500" />,        row: "bg-red-50/40" },
};

const LEVEL_HELP: Record<LogLevel, string> = {
  INFO:  "Normal activity — logins, searches, generated and downloaded datasets",
  WARN:  "Potential problems that can still be fixed — failed logins, flagged prompts, slow requests, emails not sent",
  ERROR: "Actual failures — crashed requests, failed generations, generation service down",
};

const CATEGORIES: { id: string; label: string }[] = [
  { id: "",           label: "All categories" },
  { id: "auth",       label: "Login & accounts" },
  { id: "class",      label: "Classes & enrollment" },
  { id: "search",     label: "Search" },
  { id: "generation", label: "Generation" },
  { id: "dataset",    label: "Datasets" },
  { id: "moderation", label: "Moderation & review" },
  { id: "system",     label: "System" },
];

const RANGES = [
  { id: "1h", label: "Last hour" }, { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" }, { id: "30d", label: "Last 30 days" }, { id: "all", label: "All time" },
];

const HIDDEN_DETAIL_KEYS = new Set(["triggers", "client", "page"]);

// Instructor timeline shows WHAT happened; the prompt itself lives in Prompts & Reviews
const PROMPT_ACTION_LABEL: Record<string, string> = {
  dataset_search: "Searched datasets",
  ai_search: "AI search",
  search_no_results: "Search found no datasets",
  schema_generated: "Generated a schema",
  prompt_flagged: "Prompt flagged for review",
  prompt_blocked: "Prompt blocked by a class trigger word",
  prompt_resubmitted_rejected: "Resubmitted a rejected prompt",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// One CSV cell: quoted, and a leading = + - @ neutralised so Excel never runs it as a formula
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "duration_ms" && typeof v === "number") return `${(v / 1000).toFixed(1)} s`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function LogViewer({
  endpoint, scopeNote, hidePromptText = false, onViewPrompt, initialSearch = "",
  extraQuery, showRoleFilter = false,
}: {
  endpoint: string;
  scopeNote?: string;
  /** Replace prompt text with a short action label + "View prompt" link (instructor timeline) */
  hidePromptText?: boolean;
  onViewPrompt?: (log: { student: string | null; prompt: string }) => void;
  /** Pre-fill the search box (e.g. arriving from a prompt card) */
  initialSearch?: string;
  /** Fixed filters sent with every request, e.g. { actions: "login_success,logout" } */
  extraQuery?: Record<string, string>;
  /** Show the Students / Faculty / Admins / System filter (admin view) */
  showRoleFilter?: boolean;
}) {
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [counts, setCounts]     = useState<Record<LogLevel, number>>({ INFO: 0, WARN: 0, ERROR: 0 });
  const [loading, setLoading]   = useState(true);
  const [failed, setFailed]     = useState(false);
  const [failReason, setFailReason] = useState("");   // why loading failed, shown under the message
  const [levels, setLevels]     = useState<LogLevel[]>([]);          // empty = all
  const [category, setCategory] = useState("");
  const [since, setSince]       = useState("7d");
  const [search, setSearch]     = useState(initialSearch);
  const [role, setRole]         = useState("");
  const [query, setQuery]       = useState("");                      // debounced search
  const [order, setOrder]       = useState<"newest" | "oldest">("newest");
  const [live, setLive]         = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ since, limit: "500" });
      if (levels.length) qs.set("level", levels.join(","));
      if (category) qs.set("category", category);
      if (query) qs.set("q", query);
      if (role) qs.set("role", role);
      for (const [k, v] of Object.entries(extraQuery ?? {})) if (v) qs.set(k, v);
      const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.error || `The server answered with status ${res.status}.`);
      }
      const data = await res.json();
      setLogs(data.logs ?? []);
      setCounts(data.counts ?? { INFO: 0, WARN: 0, ERROR: 0 });
      setFailed(false);
      setFailReason("");
    } catch (e) {
      setFailed(true);
      setFailReason(e instanceof Error && e.message && e.message !== "Failed to fetch"
        ? e.message : "The server could not be reached. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, since, levels, category, query, role, JSON.stringify(extraQuery ?? {})]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [live, load]);

  // Download every entry matching the current filters (up to 10,000) as a CSV file
  const exportCsv = async () => {
    setExporting(true);
    setExportMsg("");
    try {
      const qs = new URLSearchParams({ since, limit: "10000", export: "1" });
      if (levels.length) qs.set("level", levels.join(","));
      if (category) qs.set("category", category);
      if (query) qs.set("q", query);
      if (role) qs.set("role", role);
      for (const [k, v] of Object.entries(extraQuery ?? {})) if (v) qs.set(k, v);
      const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`);
      if (!res.ok) throw new Error();
      const rows: LogEntry[] = (await res.json()).logs ?? [];
      const header = ["Time", "Level", "Category", "Who", "Email", "Role", "Action", "Message", "Details"];
      const lines = rows.map((l) => {
        const details = { ...(l.details ?? {}) };
        if (hidePromptText) delete details.prompt_text;   // same as on screen
        for (const k of HIDDEN_DETAIL_KEYS) delete details[k];
        return [new Date(l.created_at).toISOString(), l.level, l.category, l.actor_name ?? "System", l.actor_email ?? "",
                l.actor_role, l.action_type, l.message, Object.keys(details).length ? details : ""].map(csvCell).join(",");
      });
      const csv = "\ufeff" + [header.map(csvCell).join(","), ...lines].join("\r\n");   // BOM → Excel reads ñ/é correctly
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = `synthcs-logs-${since}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
      setExportMsg(`Downloaded ${rows.length.toLocaleString()} entr${rows.length === 1 ? "y" : "ies"}${rows.length >= 10000 ? " (the maximum — narrow the filters for older entries)" : ""}.`);
    } catch {
      setExportMsg("Could not export the logs. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const toggleLevel = (l: LogLevel) =>
    setLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const shown = order === "newest" ? logs : [...logs].reverse();

  return (
    <div className="space-y-3">
      {/* Level counters — click to filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["INFO", "WARN", "ERROR"] as LogLevel[]).map((l) => {
          const st = LEVEL_STYLE[l];
          const active = levels.length === 0 || levels.includes(l);
          return (
            <button
              key={l}
              onClick={() => toggleLevel(l)}
              title={LEVEL_HELP[l]}
              className={`text-left rounded-xl border px-4 py-3 transition-all ${st.card} ${active ? "opacity-100" : "opacity-40"} ${levels.includes(l) ? "ring-2 ring-offset-1 ring-purple-400" : ""}`}
            >
              <div className="flex items-center gap-2">
                {st.icon}
                <span className="text-xs font-semibold text-gray-700">{st.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{counts[l].toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{LEVEL_HELP[l]}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages, prompts, students…"
              className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {showRoleFilter && (
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Who"
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">Everyone</option>
              <option value="student">Students</option>
              <option value="instructor">Faculty</option>
              <option value="admin">Admins</option>
              <option value="system">System (no user)</option>
            </select>
          )}
          <select value={since} onChange={(e) => setSince(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(["newest", "oldest"] as const).map((o) => (
              <button key={o} onClick={() => setOrder(o)}
                className={`px-2.5 py-1.5 font-medium ${order === o ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                {o === "newest" ? "Newest" : "Oldest"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600" title="Refresh every 30 seconds">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-purple-600" />
            Live
          </label>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCsv} disabled={exporting}
            title="Download the entries matching these filters as a CSV file (opens in Excel)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting…" : "Download CSV"}
          </button>
        </div>
        {exportMsg && <p className="px-4 py-2 text-[11px] text-gray-500 border-b border-gray-50">{exportMsg}</p>}
        {scopeNote && <p className="px-4 py-2 text-[11px] text-gray-400 border-b border-gray-50">{scopeNote}</p>}

        {/* Log table */}
        {failed ? (
          <div className="py-12 px-4 text-center">
            <p className="text-sm text-red-500">Could not load logs.</p>
            {failReason && <p className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">{failReason}</p>}
            <button onClick={load} className="mt-3 text-xs font-medium text-purple-600 hover:underline">Try again</button>
          </div>
        ) : loading && logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-sm text-gray-400">
            <Activity className="w-5 h-5 text-gray-300" /> No log entries match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-44">Time</th>
                  <th className="text-left px-3 py-2.5 w-20">Level</th>
                  <th className="text-left px-3 py-2.5 w-28">Category</th>
                  <th className="text-left px-3 py-2.5 w-44">Who</th>
                  <th className="text-left px-3 py-2.5">Event</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((l) => {
                  const st = LEVEL_STYLE[l.level] ?? LEVEL_STYLE.INFO;
                  const open = expanded === l.id;
                  const promptText = typeof l.details?.prompt_text === "string" ? l.details.prompt_text : "";
                  const maskPrompt = hidePromptText && !!promptText;
                  const message = maskPrompt ? (PROMPT_ACTION_LABEL[l.action_type] ?? "Used a prompt") : l.message;
                  const detailEntries = Object.entries(l.details ?? {})
                    .filter(([k]) => !HIDDEN_DETAIL_KEYS.has(k) && !(maskPrompt && k === "prompt_text"));
                  return (
                    <Fragment key={l.id}>
                      <tr onClick={() => setExpanded(open ? null : l.id)} className={`cursor-pointer hover:bg-gray-50/70 ${st.row}`}>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap tabular-nums">{formatTime(l.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.badge}`}>{l.level}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 capitalize">{l.category}</td>
                        <td className="px-3 py-2.5">
                          {l.actor_role === "system" ? (
                            <span className="text-xs font-medium text-gray-500">System</span>
                          ) : (
                            <>
                              <div className="text-xs font-medium text-gray-800 truncate max-w-[170px]">{l.actor_name ?? "Unknown user"}</div>
                              <div className="text-[11px] text-gray-400 truncate max-w-[170px] capitalize">{l.actor_role}</div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-700">
                          <span className="line-clamp-2">{message}</span>
                          {maskPrompt && onViewPrompt && (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); onViewPrompt({ student: l.actor_name, prompt: promptText }); }}
                              className="mt-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-800 hover:underline"
                            >
                              View prompt →
                            </button>
                          )}
                          {(l.triggers?.length ?? 0) > 0 && (
                            <span className="mt-1 inline-flex flex-wrap gap-1">
                              {l.triggers!.map((t, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700 text-[10px]">
                                  "{t.term}" · L{t.level}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="px-2 text-gray-300">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                      </tr>
                      {open && (
                        <tr className={st.row || "bg-gray-50/40"}>
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                              <Field k="Event" v={l.action_type} mono />
                              <Field k="Recorded by" v={l.source === "browser" ? "Browser (student's device)" : "Server"} />
                              {l.actor_email && <Field k="Account" v={l.actor_email} />}
                              {detailEntries.map(([k, v]) => (
                                <Field key={k} k={k.replace(/_/g, " ")} v={formatValue(k, v)} mono={k.endsWith("_id") || k === "route"} full={k === "prompt_text" || k === "error" || k === "stack"} />
                              ))}
                              {typeof l.details?.client === "string" && <Field k="Device / browser" v={String(l.details.client)} full />}
                              {typeof l.details?.page === "string" && <Field k="Page" v={String(l.details.page)} mono />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {logs.length >= 500 && (
              <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-50">Showing the 500 most recent matching entries — narrow the filters to see older ones.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ k, v, mono = false, full = false }: { k: string; v: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={`flex gap-2 min-w-0 ${full ? "md:col-span-2" : ""}`}>
      <span className="flex-shrink-0 w-32 text-gray-400 capitalize">{k}</span>
      <span className={`text-gray-700 min-w-0 ${full ? "whitespace-pre-wrap break-words" : "truncate"} ${mono ? "font-mono text-[11px]" : ""}`}>{v}</span>
    </div>
  );
}
