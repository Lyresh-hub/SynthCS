import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Plus, Trash2, UserPlus } from "lucide-react";
import { NODE_API as BACKEND } from "../lib/config";

// ── Admin: instructor invite links ──────────────────────────────────────────
// The admin creates a link for a course and sends it to the new instructor.
// Opening it shows the instructor sign-up page; signing up creates the instructor
// account, assigns the course (with a student invite link ready to share) and uses
// up the link. Links work once and expire after 7 days.

const FRONTEND_URL = "https://synthcs.site";

type Invite = {
  id: string;
  token: string;
  course: string;
  status: "active" | "inactive" | "used" | "expired";
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_name: string | null;
  used_by_email: string | null;
};

const STATUS_STYLE: Record<Invite["status"], { label: string; cls: string }> = {
  active:   { label: "Active",   cls: "bg-green-50 text-green-700 border-green-200" },
  inactive: { label: "Switched off", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  used:     { label: "Used",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  expired:  { label: "Expired",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function InstructorInvites({ knownCourses }: { knownCourses: string[] }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [course, setCourse]   = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/instructor-invites`);
      if (res.ok) setInvites(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const linkOf = (token: string) => `${FRONTEND_URL}/?instructor_invite=${token}`;

  const copy = (inv: Invite) => {
    navigator.clipboard.writeText(linkOf(inv.token)).then(() => {
      setCopied(inv.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const create = async () => {
    if (!course.trim()) { setError("Enter the course this instructor will handle."); return; }
    setCreating(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/admin/instructor-invites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: course.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? data.error ?? "Could not create the link."); return; }
      setInvites((prev) => [data, ...prev]);
      setCourse("");
      copy(data);   // ready to paste into a message
    } finally { setCreating(false); }
  };

  const toggle = async (inv: Invite) => {
    const res = await fetch(`${BACKEND}/api/admin/instructor-invites/${inv.id}/toggle`, { method: "PATCH" });
    if (res.ok) {
      const { active } = await res.json();
      setInvites((prev) => prev.map((x) => (x.id === inv.id ? { ...x, status: active ? "active" : "inactive" } : x)));
    }
  };

  const remove = async (inv: Invite) => {
    if (!confirm(`Delete the instructor invite link for "${inv.course}"? ${inv.status === "used" ? "The instructor's account is not affected." : "The link will stop working."}`)) return;
    const res = await fetch(`${BACKEND}/api/admin/instructor-invites/${inv.id}`, { method: "DELETE" });
    if (res.ok) setInvites((prev) => prev.filter((x) => x.id !== inv.id));
  };

  return (
    <div className="space-y-4">
      {/* Create */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-800">Invite an instructor</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Create a sign-up link for a course and send it to the instructor. When they sign up with it, their instructor
          account is created and the course is assigned to them, with a student invite link ready to share.
          Each link works <strong className="font-medium text-gray-600">once</strong> and expires after <strong className="font-medium text-gray-600">7 days</strong>.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            list="known-courses"
            maxLength={100}
            placeholder="Course, e.g. Data Science"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <datalist id="known-courses">
            {knownCourses.map((c) => <option key={c} value={c} />)}
          </datalist>
          <button onClick={create} disabled={creating}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
            <Plus className="w-4 h-4" /> {creating ? "Creating…" : "Create link"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : invites.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No instructor invite links yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invites.map((inv) => {
              const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.inactive;
              const usable = inv.status === "active";
              return (
                <div key={inv.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <span className="text-sm font-medium text-gray-900">{inv.course}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        Created {fmtDate(inv.created_at)}
                        {inv.status === "used" && inv.used_at ? ` · used ${fmtDate(inv.used_at)}` : ` · expires ${fmtDate(inv.expires_at)}`}
                      </span>
                    </div>
                    {inv.status === "used" ? (
                      <p className="text-xs text-blue-700">Signed up: {inv.used_by_name} <span className="text-gray-400">({inv.used_by_email})</span></p>
                    ) : (
                      <p className={`text-xs font-mono truncate sm:max-w-[360px] ${usable ? "text-gray-400" : "text-gray-300 line-through"}`}>
                        {linkOf(inv.token)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {inv.status !== "used" && (
                      <>
                        <button onClick={() => copy(inv)} disabled={!usable}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-xs font-medium rounded-lg">
                          {copied === inv.id ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
                        </button>
                        {inv.status !== "expired" && (
                          <button onClick={() => toggle(inv)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${usable ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
                            {usable ? "Switch off" : "Switch on"}
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => remove(inv)} title="Delete link"
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
