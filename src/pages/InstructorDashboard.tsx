import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  LogOut, Clock, CheckCircle, XCircle, Users, AlertTriangle,
  Activity, Link as LinkIcon, Plus, Trash2, UserMinus, UserPlus, Copy, Check,
} from "lucide-react";
import { NODE_API as BACKEND } from "../lib/config";

type Student = {
  id: string;
  full_name: string;
  email: string;
  course: string;
  instructor: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

type FlaggedPrompt = {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  prompt_text: string;
  flag_reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

type ActivityEntry = {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
};

type Invite = {
  id: string;
  course: string;
  token: string;
  active: boolean;
  created_at: string;
};

type Tab = "pending" | "flagged" | "activity" | "students" | "invites";

const FRONTEND = "https://synthcs.site";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  schema_generated:   { label: "Generated schema",   color: "text-purple-600 bg-purple-50 border-purple-100" },
  schema_saved:       { label: "Saved schema",        color: "text-blue-600 bg-blue-50 border-blue-100" },
  dataset_downloaded: { label: "Downloaded dataset",  color: "text-green-600 bg-green-50 border-green-100" },
  prompt_flagged:     { label: "Prompt flagged",      color: "text-red-600 bg-red-50 border-red-100" },
};

export default function InstructorDashboard() {
  const [, setLocation] = useLocation();
  const instructorId   = localStorage.getItem("user_id")   ?? "";
  const instructorName = localStorage.getItem("user_name") ?? "";

  const [tab, setTab] = useState<Tab>("pending");

  const [students,       setStudents]       = useState<Student[]>([]);
  const [flagged,        setFlagged]        = useState<FlaggedPrompt[]>([]);
  const [activity,       setActivity]       = useState<ActivityEntry[]>([]);
  const [invites,        setInvites]        = useState<Invite[]>([]);

  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingFlagged,  setLoadingFlagged]  = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingInvites,  setLoadingInvites]  = useState(false);

  const [actionId,  setActionId]  = useState<string | null>(null);
  const [addEmail,  setAddEmail]  = useState("");
  const [addError,  setAddError]  = useState("");
  const [addOk,     setAddOk]     = useState(false);
  const [copiedId,  setCopiedId]  = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState("Data Science");

  useEffect(() => {
    if (!instructorId || localStorage.getItem("is_instructor") !== "true") {
      setLocation("/login");
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const res = await fetch(`${BACKEND}/instructor/students?instructor_id=${instructorId}`);
      if (res.ok) setStudents(await res.json());
    } finally { setLoadingStudents(false); }
  }, [instructorId]);

  const fetchFlagged = useCallback(async () => {
    setLoadingFlagged(true);
    try {
      const res = await fetch(`${BACKEND}/instructor/flagged-prompts?instructor_id=${instructorId}`);
      if (res.ok) setFlagged(await res.json());
    } finally { setLoadingFlagged(false); }
  }, [instructorId]);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await fetch(`${BACKEND}/instructor/activity?instructor_id=${instructorId}`);
      if (res.ok) setActivity(await res.json());
    } finally { setLoadingActivity(false); }
  }, [instructorId]);

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch(`${BACKEND}/instructor/invites?instructor_id=${instructorId}`);
      if (res.ok) setInvites(await res.json());
    } finally { setLoadingInvites(false); }
  }, [instructorId]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { if (tab === "flagged")  fetchFlagged();  }, [tab, fetchFlagged]);
  useEffect(() => { if (tab === "activity") fetchActivity(); }, [tab, fetchActivity]);
  useEffect(() => { if (tab === "invites")  fetchInvites();  }, [tab, fetchInvites]);

  const handleApprove = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/approve/${studentId}`, { method: "POST" });
      if (res.ok) setStudents((p) => p.map((s) => s.id === studentId ? { ...s, approval_status: "approved" } : s));
    } finally { setActionId(null); }
  };

  const handleReject = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/reject/${studentId}`, { method: "POST" });
      if (res.ok) setStudents((p) => p.map((s) => s.id === studentId ? { ...s, approval_status: "rejected" } : s));
    } finally { setActionId(null); }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm("Remove this student from your class? They will need to re-register.")) return;
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/students/${studentId}/remove`, { method: "PATCH" });
      if (res.ok) setStudents((p) => p.filter((s) => s.id !== studentId));
    } finally { setActionId(null); }
  };

  const handleAddStudent = async () => {
    if (!addEmail.trim()) return;
    setAddError(""); setAddOk(false);
    try {
      const res = await fetch(`${BACKEND}/instructor/students/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId, email: addEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add student"); return; }
      setStudents((p) => [...p, { ...data, approval_status: "approved" } as Student]);
      setAddEmail(""); setAddOk(true);
      setTimeout(() => setAddOk(false), 3000);
    } catch { setAddError("Could not reach the server"); }
  };

  const handleApprovePrompt = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`${BACKEND}/instructor/flagged-prompts/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId }),
      });
      if (res.ok) setFlagged((p) => p.map((f) => f.id === id ? { ...f, status: "approved" } : f));
    } finally { setActionId(null); }
  };

  const handleRejectPrompt = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`${BACKEND}/instructor/flagged-prompts/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId }),
      });
      if (res.ok) setFlagged((p) => p.map((f) => f.id === id ? { ...f, status: "rejected" } : f));
    } finally { setActionId(null); }
  };

  const handleCreateInvite = async () => {
    try {
      const res = await fetch(`${BACKEND}/instructor/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId, course: newCourse }),
      });
      if (res.ok) { const inv = await res.json(); setInvites((p) => [inv, ...p]); }
    } catch {}
  };

  const handleDeleteInvite = async (id: string) => {
    await fetch(`${BACKEND}/instructor/invites/${id}`, { method: "DELETE" });
    setInvites((p) => p.filter((i) => i.id !== id));
  };

  const copyInviteLink = (token: string, id: string) => {
    navigator.clipboard.writeText(`${FRONTEND}/?invite=${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSignOut = () => {
    ["user_id","user_name","is_admin","is_instructor","last_path"].forEach((k) => localStorage.removeItem(k));
    setLocation("/login");
  };

  const pendingCount = students.filter((s) => s.approval_status === "pending").length;
  const flaggedCount = flagged.filter((f) => f.status === "pending").length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "pending",  label: "Approvals",       icon: <Clock className="w-3.5 h-3.5" />,         badge: pendingCount },
    { id: "flagged",  label: "Flagged Prompts",  icon: <AlertTriangle className="w-3.5 h-3.5" />, badge: flaggedCount },
    { id: "activity", label: "Activity",         icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "students", label: "Students",         icon: <Users className="w-3.5 h-3.5" /> },
    { id: "invites",  label: "Invite Links",     icon: <LinkIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1E1347] border-b border-white/10 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/synthcs-logo.png" alt="SynthCS" className="w-7 h-7 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
          <div>
            <span className="text-white font-semibold text-sm">SynthCS</span>
            <span className="text-purple-300/60 text-xs ml-2">Instructor Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-purple-200/70 text-sm hidden sm:block">{instructorName}</span>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-purple-200/70 hover:text-white text-sm transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Instructor Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Manage students, review prompts, and monitor activity.</p>
        </div>

        <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit mb-6 shadow-sm flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t.icon}
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === t.id ? "bg-white/20 text-white" : "bg-purple-100 text-purple-600"
                }`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "pending" && (
          <StudentTable rows={students} loading={loadingStudents} filter="pending"
            actionId={actionId} onApprove={handleApprove} onReject={handleReject} />
        )}

        {tab === "flagged" && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingFlagged ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
            ) : flagged.length === 0 ? (
              <EmptyState icon={<AlertTriangle className="w-5 h-5 text-gray-300" />} text="No flagged prompts." />
            ) : (
              <div className="divide-y divide-gray-50">
                {flagged.map((fp) => (
                  <div key={fp.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{fp.student_name}</span>
                          <span className="text-xs text-gray-400">{fp.student_email}</span>
                          <StatusBadge status={fp.status} />
                        </div>
                        <p className="text-xs text-gray-500 mb-1.5">
                          <span className="font-medium text-amber-600">Flag reason:</span> {fp.flag_reason}
                        </p>
                        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-700 leading-relaxed">
                          {fp.prompt_text}
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {new Date(fp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {fp.status === "pending" && (
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button onClick={() => handleApprovePrompt(fp.id)} disabled={actionId === fp.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                            Approve
                          </button>
                          <button onClick={() => handleRejectPrompt(fp.id)} disabled={actionId === fp.id}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingActivity ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
            ) : activity.length === 0 ? (
              <EmptyState icon={<Activity className="w-5 h-5 text-gray-300" />} text="No activity recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {activity.map((a) => {
                      const meta = ACTION_LABELS[a.action_type] ?? { label: a.action_type, color: "text-gray-500 bg-gray-50 border-gray-100" };
                      return (
                        <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900 text-xs truncate max-w-[160px]">{a.student_name}</div>
                            <div className="text-xs text-gray-400 truncate max-w-[160px]">{a.student_email}</div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 max-w-[220px]">
                            {(a.action_type === "schema_generated" || a.action_type === "prompt_flagged")
                              ? <span className="truncate block">{String(a.details.prompt_text ?? "")}</span>
                              : a.action_type === "schema_saved"
                              ? String(a.details.schema_name ?? "")
                              : a.action_type === "dataset_downloaded"
                              ? `${a.details.table_name ?? ""} · ${a.details.rows != null ? Number(a.details.rows).toLocaleString() : "?"} rows`
                              : "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "students" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-purple-500" /> Add student manually
              </p>
              <div className="flex gap-2">
                <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="student@gordoncollege.edu.ph"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAddStudent()} />
                <button onClick={handleAddStudent}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {addError && <p className="mt-2 text-xs text-red-500">{addError}</p>}
              {addOk    && <p className="mt-2 text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Student added successfully.</p>}
            </div>
            <StudentTable rows={students} loading={loadingStudents} filter="all"
              actionId={actionId} onApprove={handleApprove} onReject={handleReject} onRemove={handleRemoveStudent} />
          </div>
        )}

        {tab === "invites" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-purple-500" /> Generate invitation link
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Share with students — they land on signup with your name and course pre-filled.
              </p>
              <div className="flex gap-2">
                <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="Data Science">Data Science</option>
                  <option value="Thesis Writing">Thesis Writing</option>
                </select>
                <button onClick={handleCreateInvite}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> Generate
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingInvites ? (
                <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
              ) : invites.length === 0 ? (
                <EmptyState icon={<LinkIcon className="w-5 h-5 text-gray-300" />} text="No invite links yet." />
              ) : (
                <div className="divide-y divide-gray-50">
                  {invites.map((inv) => (
                    <div key={inv.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">{inv.course}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono truncate max-w-[340px]">
                          {FRONTEND}/?invite={inv.token}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => copyInviteLink(inv.token, inv.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg transition-colors">
                          {copiedId === inv.id
                            ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</>
                            : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                        <button onClick={() => handleDeleteInvite(inv.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">{icon}</div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-600 border border-yellow-100"><Clock className="w-3 h-3" />Pending</span>;
  if (status === "approved")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-100"><CheckCircle className="w-3 h-3" />Approved</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-500 border border-red-100"><XCircle className="w-3 h-3" />Rejected</span>;
}

function StudentTable({
  rows, loading, filter, actionId, onApprove, onReject, onRemove,
}: {
  rows: Student[];
  loading: boolean;
  filter: "pending" | "all";
  actionId: string | null;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const displayed = filter === "pending" ? rows.filter((s) => s.approval_status === "pending") : rows;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading students…</div>
      ) : displayed.length === 0 ? (
        <EmptyState icon={<Users className="w-5 h-5 text-gray-300" />}
          text={filter === "pending" ? "No students pending approval." : "No students found for your class."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Course</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Registered</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayed.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900 truncate max-w-[180px]">{s.full_name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[180px]">{s.email}</div>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{s.course ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={s.approval_status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {s.approval_status === "pending" && (
                        <>
                          <button onClick={() => onApprove(s.id)} disabled={actionId === s.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                            Approve
                          </button>
                          <button onClick={() => onReject(s.id)} disabled={actionId === s.id}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                            Reject
                          </button>
                        </>
                      )}
                      {onRemove && (
                        <button onClick={() => onRemove(s.id)} disabled={actionId === s.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from class">
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                      {s.approval_status !== "pending" && !onRemove && (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
