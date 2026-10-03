import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Clock, CheckCircle, XCircle, RefreshCw, Search, Sparkles, Layers, Play, Inbox } from "lucide-react";
import { NODE_API } from "../lib/config";

// ── My Requests ───────────────────────────────────────────────────────────────
// Students track their flagged prompts here: Pending (waiting for the instructor),
// Approved (open the results of that prompt), or Rejected. Refreshes itself.

type RequestStatus = "pending" | "approved" | "rejected";
type RequestContext = "dataset_search" | "ai_search" | "ai_schema" | "generate" | null;

interface ReviewRequest {
  id: string;
  prompt_text: string;
  status: RequestStatus;
  context: RequestContext;
  created_at: string;
  reviewed_at: string | null;
  instructor_name: string | null;
  datasets: number;
}

const STATUS_META: Record<RequestStatus, { label: string; icon: React.ReactNode; badge: string; card: string }> = {
  pending:  { label: "Pending review", icon: <Clock className="w-3.5 h-3.5" />,       badge: "bg-amber-50 text-amber-700 border-amber-200", card: "border-amber-200" },
  approved: { label: "Approved",       icon: <CheckCircle className="w-3.5 h-3.5" />, badge: "bg-green-50 text-green-700 border-green-200", card: "border-green-200" },
  rejected: { label: "Rejected",       icon: <XCircle className="w-3.5 h-3.5" />,     badge: "bg-red-50 text-red-700 border-red-200",       card: "border-red-200" },
};

const CONTEXT_META: Record<string, { label: string; icon: React.ReactNode; openLabel: string }> = {
  dataset_search: { label: "Dataset search",   icon: <Search className="w-3.5 h-3.5" />,   openLabel: "Open search results" },
  ai_search:      { label: "AI search",        icon: <Sparkles className="w-3.5 h-3.5" />, openLabel: "Open search results" },
  ai_schema:      { label: "AI schema",        icon: <Sparkles className="w-3.5 h-3.5" />, openLabel: "Open generated schema" },
  generate:       { label: "Dataset generation", icon: <Layers className="w-3.5 h-3.5" />, openLabel: "Continue in Schema Builder" },
};

const FILTERS: { id: "all" | RequestStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MyRequests() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [failed, setFailed]     = useState(false);
  const [filter, setFilter]     = useState<"all" | RequestStatus>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${NODE_API}/api/student/reviews`);
      if (!res.ok) throw new Error();
      setRequests(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh every 20 s so a decision shows up without reloading the page
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  // Approved → re-run the exact step that was stopped, in the Schema Builder
  const openResults = (r: ReviewRequest) => {
    sessionStorage.setItem("sb_open_request", JSON.stringify({
      kind: r.context ?? "ai_search",
      prompt: r.prompt_text,
    }));
    setLocation("/schema-builder");
  };

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };
  const shown = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 max-w-xl">
          Prompts the system flagged and sent to your instructor. A flagged prompt is locked until your instructor
          decides — this page updates on its own.
        </p>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.id ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label} <span className={filter === f.id ? "text-purple-100" : "text-gray-400"}>({counts[f.id]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-sm text-gray-400">Loading…</div>
      ) : failed ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">Could not load your requests. Please try again.</div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 flex flex-col items-center gap-2 text-sm text-gray-400">
          <Inbox className="w-6 h-6 text-gray-300" />
          {requests.length === 0 ? "No flagged prompts — nothing is waiting for review." : "No requests with this status."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const st = STATUS_META[r.status];
            const ctx = CONTEXT_META[r.context ?? "ai_search"];
            return (
              <div key={r.id} className={`bg-white border rounded-xl shadow-sm p-4 space-y-3 ${st.card}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${st.badge}`}>
                    {st.icon} {st.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    {ctx.icon} {ctx.label}
                  </span>
                  <span className="ml-auto text-[11px] text-gray-400">Submitted {formatTime(r.created_at)}</span>
                </div>

                <p className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 break-words">
                  {r.prompt_text}
                </p>

                {r.status === "pending" && (
                  <p className="text-xs text-amber-700">
                    Waiting for {r.instructor_name ?? "your instructor"} to review. This prompt is locked until then — you'll
                    also get an email when they decide.
                  </p>
                )}

                {r.status === "approved" && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-green-700">
                      Approved by {r.instructor_name ?? "your instructor"} on {formatTime(r.reviewed_at)}.
                      {r.datasets > 0 && ` ${r.datasets} dataset${r.datasets === 1 ? " is" : "s are"} now available in Downloads.`}
                    </p>
                    <button
                      onClick={() => openResults(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> {ctx.openLabel} →
                    </button>
                  </div>
                )}

                {r.status === "rejected" && (
                  <p className="text-xs text-red-600">
                    Rejected by {r.instructor_name ?? "your instructor"} on {formatTime(r.reviewed_at)}. This prompt can't be
                    used — try a different prompt. Rejected prompts count as a strike on your account.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
