import { useState, useEffect, useCallback } from "react";
import { Users, Activity, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { NODE_API as BACKEND } from "../lib/config";

type StudentRow = {
  id: string;
  full_name: string;
  email: string;
  course: string;
  approval_status: string;
  semester: string | null;
  created_at: string;
};

type InstructorClass = {
  id: string;
  full_name: string;
  email: string;
  students: StudentRow[];
};

type ActivityEntry = {
  id: string;
  instructor_name: string;
  instructor_email: string;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
};

type Tab = "classes" | "activity";

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  approved:   { label: "Approved",   icon: <CheckCircle className="w-3 h-3" />, cls: "text-green-600 bg-green-50 border-green-100" },
  pending:    { label: "Pending",    icon: <Clock className="w-3 h-3" />,        cls: "text-yellow-600 bg-yellow-50 border-yellow-100" },
  rejected:   { label: "Rejected",   icon: <XCircle className="w-3 h-3" />,      cls: "text-red-500 bg-red-50 border-red-100" },
  terminated: { label: "Terminated", icon: <XCircle className="w-3 h-3" />,      cls: "text-gray-500 bg-gray-100 border-gray-200" },
};

const ACTION_LABELS: Record<string, string> = {
  student_approved:   "Approved student",
  student_rejected:   "Rejected student",
  prompt_approved:    "Approved flagged prompt",
  prompt_rejected:    "Rejected flagged prompt",
  schema_generated:   "Generated schema",
  schema_saved:       "Saved schema",
  dataset_downloaded: "Downloaded dataset",
};

const ACTION_COLORS: Record<string, string> = {
  student_approved:   "text-green-600 bg-green-50 border-green-100",
  student_rejected:   "text-red-500 bg-red-50 border-red-100",
  prompt_approved:    "text-blue-600 bg-blue-50 border-blue-100",
  prompt_rejected:    "text-orange-600 bg-orange-50 border-orange-100",
  schema_generated:   "text-purple-600 bg-purple-50 border-purple-100",
  schema_saved:       "text-indigo-600 bg-indigo-50 border-indigo-100",
  dataset_downloaded: "text-teal-600 bg-teal-50 border-teal-100",
};

export default function AdminClasses() {
  const adminId = localStorage.getItem("user_id") ?? "";

  const [tab, setTab]               = useState<Tab>("classes");
  const [classes,  setClasses]      = useState<InstructorClass[]>([]);
  const [activity, setActivity]     = useState<ActivityEntry[]>([]);
  const [loadingClasses,  setLoadingClasses]  = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [expanded,  setExpanded]    = useState<Set<string>>(new Set());
  const [termId,    setTermId]      = useState<string | null>(null);
  const [semInputs, setSemInputs]   = useState<Record<string, string>>({});
  const [termResult, setTermResult] = useState<Record<string, string>>({});

  const fetchClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/classes?admin_id=${adminId}`);
      if (res.ok) setClasses(await res.json());
    } finally { setLoadingClasses(false); }
  }, [adminId]);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/activity?admin_id=${adminId}`);
      if (res.ok) setActivity(await res.json());
    } finally { setLoadingActivity(false); }
  }, [adminId]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);
  useEffect(() => { if (tab === "activity") fetchActivity(); }, [tab, fetchActivity]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleTerminate = async (instructorId: string) => {
    const semester = semInputs[instructorId]?.trim() || null;
    if (!confirm(`Terminate all active students under this instructor${semester ? ` (${semester})` : ""}? They will no longer be able to log in.`)) return;
    setTermId(instructorId);
    try {
      const res = await fetch(`${BACKEND}/api/admin/classes/${instructorId}/terminate?admin_id=${adminId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semester }),
      });
      const data = await res.json();
      if (res.ok) {
        setTermResult((p) => ({ ...p, [instructorId]: `${data.terminated} student(s) terminated.` }));
        setClasses((prev) => prev.map((ins) =>
          ins.id !== instructorId ? ins : {
            ...ins,
            students: ins.students.map((s) =>
              s.approval_status === "terminated" ? s : { ...s, approval_status: "terminated", semester: semester ?? s.semester }
            ),
          }
        ));
      }
    } finally { setTermId(null); }
  };

  const activeCount  = (students: StudentRow[]) => students.filter((s) => s.approval_status === "approved").length;
  const pendingCount = (students: StudentRow[]) => students.filter((s) => s.approval_status === "pending").length;
  const termCount    = (students: StudentRow[]) => students.filter((s) => s.approval_status === "terminated").length;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit shadow-sm">
        <TabBtn active={tab === "classes"}  onClick={() => setTab("classes")}  icon={<Users className="w-3.5 h-3.5" />}    label="Classes" />
        <TabBtn active={tab === "activity"} onClick={() => setTab("activity")} icon={<Activity className="w-3.5 h-3.5" />} label="Instructor Activity" />
      </div>

      {/* ── Classes ── */}
      {tab === "classes" && (
        <div className="space-y-4">
          {loadingClasses ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : classes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">No instructors found.</div>
          ) : classes.map((ins) => (
            <div key={ins.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Instructor header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                onClick={() => toggleExpand(ins.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0">
                    {ins.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{ins.full_name}</div>
                    <div className="text-xs text-gray-400">{ins.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">{ins.students.length} students</span>
                    {activeCount(ins.students) > 0  && <span className="text-green-600 font-medium">{activeCount(ins.students)} active</span>}
                    {pendingCount(ins.students) > 0 && <span className="text-yellow-600 font-medium">{pendingCount(ins.students)} pending</span>}
                    {termCount(ins.students) > 0    && <span className="text-gray-400">{termCount(ins.students)} terminated</span>}
                  </div>
                  {expanded.has(ins.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded: student list + terminate */}
              {expanded.has(ins.id) && (
                <div className="border-t border-gray-100">
                  {ins.students.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">No students enrolled.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[560px]">
                        <thead>
                          <tr className="bg-gray-50/60 border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Course</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Semester</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {ins.students.map((s) => {
                            const meta = STATUS_META[s.approval_status] ?? STATUS_META.pending;
                            return (
                              <tr key={s.id} className="hover:bg-gray-50/40 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="font-medium text-gray-800 text-xs truncate max-w-[180px]">{s.full_name}</div>
                                  <div className="text-xs text-gray-400 truncate max-w-[180px]">{s.email}</div>
                                </td>
                                <td className="px-5 py-3 text-xs text-gray-600">{s.course ?? "—"}</td>
                                <td className="px-5 py-3 text-xs text-gray-500">{s.semester ?? "—"}</td>
                                <td className="px-5 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                                    {meta.icon}{meta.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Terminate section */}
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      End semester — terminates all active student access for this class:
                    </div>
                    <input
                      type="text"
                      value={semInputs[ins.id] ?? ""}
                      onChange={(e) => setSemInputs((p) => ({ ...p, [ins.id]: e.target.value }))}
                      placeholder="Semester label (e.g. 1st Sem 2025–2026)"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-56"
                    />
                    <button
                      onClick={() => handleTerminate(ins.id)}
                      disabled={termId === ins.id || activeCount(ins.students) === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {termId === ins.id ? "Terminating…" : "Terminate Class"}
                    </button>
                    {termResult[ins.id] && (
                      <span className="text-xs text-green-600 font-medium">{termResult[ins.id]}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Instructor Activity ── */}
      {tab === "activity" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loadingActivity ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : activity.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No instructor activity recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Instructor</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activity.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900 text-xs truncate max-w-[160px]">{a.instructor_name}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[160px]">{a.instructor_email}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACTION_COLORS[a.action_type] ?? "text-gray-500 bg-gray-50 border-gray-100"}`}>
                          {ACTION_LABELS[a.action_type] ?? a.action_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 max-w-[240px]">
                        {a.details.student_name
                          ? String(a.details.student_name)
                          : a.details.prompt_text
                          ? <span className="truncate block max-w-[240px]">{String(a.details.prompt_text)}</span>
                          : a.details.schema_name
                          ? String(a.details.schema_name)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}>
      {icon}{label}
    </button>
  );
}
