import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  LogOut, Clock, CheckCircle, XCircle, Users, AlertTriangle,
  Activity, Link as LinkIcon, Plus, Trash2, UserMinus, UserPlus, Copy, Check,
  MessageSquare, Search, ChevronDown, ChevronUp, ShieldAlert, Shield, Ban,
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

type Tab = "pending" | "flagged" | "activity" | "students" | "invites" | "prompts" | "restrictions";

type Restriction = {
  id: string;
  restriction_type: "keyword" | "allowed_category" | "allowed_purpose" | "quota";
  value: string;
  action: "flag" | "block";
  created_at: string;
};

const ALL_CATEGORIES = [
  "Healthcare / Medical", "Finance / Banking", "E-Commerce / Retail",
  "Education / Academic", "Human Resources", "Logistics / Supply Chain",
  "Government / Public Records", "Technology / Software", "Other",
];
const ALL_PURPOSES = ["Homework", "Project", "Research", "Testing / Evaluation"];

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

  type PromptEntry = {
    id: string; student_name: string; student_email: string;
    prompt_text: string; flag_reason: string | null; status: string | null;
    created_at: string; source: "flagged" | "generated";
  };
  const [prompts,        setPrompts]        = useState<PromptEntry[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptSearch,   setPromptSearch]   = useState("");

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Restrictions tab state
  const [restrictions,        setRestrictions]        = useState<Restriction[]>([]);
  const [loadingRestrictions, setLoadingRestrictions] = useState(false);
  const [newKeyword,          setNewKeyword]          = useState("");
  const [newKeywordAction,    setNewKeywordAction]    = useState<"flag" | "block">("flag");
  const [quotaInput,          setQuotaInput]          = useState("");
  const [savingRestriction,   setSavingRestriction]   = useState(false);

  const SUSPICIOUS_KEYWORDS = [
    "fake", "forged", "counterfeit", "illegal", "fraud", "stolen", "laundering",
    "identity theft", "phishing", "scam", "fabricated", "falsified", "hack",
    "exploit", "bypass", "cheat", "manipulate", "bribe", "corrupt",
  ];
  const isSuspicious = (text: string) =>
    SUSPICIOUS_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));

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

  const fetchPrompts = useCallback(async () => {
    setLoadingPrompts(true);
    try {
      const res = await fetch(`${BACKEND}/instructor/prompt-history?instructor_id=${instructorId}`);
      if (res.ok) setPrompts(await res.json());
    } finally { setLoadingPrompts(false); }
  }, [instructorId]);

  const fetchRestrictions = useCallback(async () => {
    setLoadingRestrictions(true);
    try {
      const res = await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions`);
      if (res.ok) {
        const data: Restriction[] = await res.json();
        setRestrictions(data);
        const quota = data.find((r) => r.restriction_type === "quota");
        if (quota) setQuotaInput(quota.value);
      }
    } finally { setLoadingRestrictions(false); }
  }, [instructorId]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { if (tab === "flagged")       fetchFlagged();       }, [tab, fetchFlagged]);
  useEffect(() => { if (tab === "activity")      fetchActivity();      }, [tab, fetchActivity]);
  useEffect(() => { if (tab === "invites")       fetchInvites();       }, [tab, fetchInvites]);
  useEffect(() => { if (tab === "prompts")       fetchPrompts();       }, [tab, fetchPrompts]);
  useEffect(() => { if (tab === "restrictions")  fetchRestrictions();  }, [tab, fetchRestrictions]);

  const handleApprove = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/approve/${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId }),
      });
      if (res.ok) setStudents((p) => p.map((s) => s.id === studentId ? { ...s, approval_status: "approved" } : s));
    } finally { setActionId(null); }
  };

  const handleReject = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/reject/${studentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId }),
      });
      if (res.ok) setStudents((p) => p.map((s) => s.id === studentId ? { ...s, approval_status: "rejected" } : s));
    } finally { setActionId(null); }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm("Remove this student from your class? They will need to re-enroll.")) return;
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/students/${studentId}/remove`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: instructorId }),
      });
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
      if (!res.ok) { setAddError(data.error ?? "Failed to send invitation"); return; }
      setAddEmail(""); setAddOk(true);
      setTimeout(() => setAddOk(false), 5000);
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

  const handleToggleInvite = async (id: string) => {
    const res = await fetch(`${BACKEND}/instructor/invites/${id}/toggle`, { method: "PATCH" });
    const data = await res.json();
    setInvites((p) => p.map((i) => i.id === id ? { ...i, active: data.active } : i));
  };

  const copyInviteLink = (token: string, id: string) => {
    navigator.clipboard.writeText(`${FRONTEND}/?invite=${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    setSavingRestriction(true);
    try {
      const res = await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restriction_type: "keyword", value: newKeyword.trim(), action: newKeywordAction }),
      });
      if (res.ok) { const r = await res.json(); setRestrictions((p) => [...p, r]); setNewKeyword(""); }
    } finally { setSavingRestriction(false); }
  };

  const handleToggleCategory = async (cat: string, isChecked: boolean) => {
    if (isChecked) {
      const res = await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restriction_type: "allowed_category", value: cat }),
      });
      if (res.ok) { const r = await res.json(); setRestrictions((p) => [...p, r]); }
    } else {
      const existing = restrictions.find((r) => r.restriction_type === "allowed_category" && r.value === cat);
      if (!existing) return;
      await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions/${existing.id}`, { method: "DELETE" });
      setRestrictions((p) => p.filter((r) => r.id !== existing.id));
    }
  };

  const handleTogglePurpose = async (purpose: string, isChecked: boolean) => {
    if (isChecked) {
      const res = await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restriction_type: "allowed_purpose", value: purpose }),
      });
      if (res.ok) { const r = await res.json(); setRestrictions((p) => [...p, r]); }
    } else {
      const existing = restrictions.find((r) => r.restriction_type === "allowed_purpose" && r.value === purpose);
      if (!existing) return;
      await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions/${existing.id}`, { method: "DELETE" });
      setRestrictions((p) => p.filter((r) => r.id !== existing.id));
    }
  };

  const handleSaveQuota = async () => {
    const n = parseInt(quotaInput, 10);
    if (isNaN(n) || n < 0) return;
    setSavingRestriction(true);
    try {
      const existing = restrictions.find((r) => r.restriction_type === "quota");
      if (existing) {
        await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions/${existing.id}`, { method: "DELETE" });
        setRestrictions((p) => p.filter((r) => r.id !== existing.id));
      }
      if (n > 0) {
        const res = await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restriction_type: "quota", value: String(n) }),
        });
        if (res.ok) { const r = await res.json(); setRestrictions((p) => [...p, r]); }
      }
    } finally { setSavingRestriction(false); }
  };

  const handleDeleteRestriction = async (id: string) => {
    await fetch(`${BACKEND}/api/instructor/${instructorId}/restrictions/${id}`, { method: "DELETE" });
    setRestrictions((p) => p.filter((r) => r.id !== id));
  };

  const handleSignOut = () => {
    ["user_id","user_name","is_admin","is_instructor","last_path"].forEach((k) => localStorage.removeItem(k));
    setLocation("/login");
  };

  const pendingCount = students.filter((s) => s.approval_status === "pending").length;
  const flaggedCount = flagged.filter((f) => f.status === "pending").length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "pending",      label: "Approvals",       icon: <Clock className="w-3.5 h-3.5" />,         badge: pendingCount },
    { id: "flagged",      label: "Flagged Prompts",  icon: <AlertTriangle className="w-3.5 h-3.5" />, badge: flaggedCount },
    { id: "activity",     label: "Activity",         icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "students",     label: "Students",         icon: <Users className="w-3.5 h-3.5" /> },
    { id: "invites",      label: "Invite Links",     icon: <LinkIcon className="w-3.5 h-3.5" /> },
    { id: "prompts",      label: "Prompt History",   icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "restrictions", label: "Restrictions",     icon: <Shield className="w-3.5 h-3.5" /> },
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
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Time</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {activity.map((a) => {
                      const meta = ACTION_LABELS[a.action_type] ?? { label: a.action_type, color: "text-gray-500 bg-gray-50 border-gray-100" };
                      const promptText = String(a.details.prompt_text ?? "");
                      const purpose    = String(a.details.purpose   ?? "");
                      const category   = String(a.details.category  ?? "");
                      const suspicious = promptText && isSuspicious(promptText);
                      const isExpanded = expandedRow === a.id;
                      const summaryText =
                        (a.action_type === "schema_generated" || a.action_type === "prompt_flagged")
                          ? promptText
                          : a.action_type === "schema_saved"
                          ? String(a.details.schema_name ?? "")
                          : a.action_type === "dataset_downloaded"
                          ? `${a.details.table_name ?? ""} · ${a.details.rows != null ? Number(a.details.rows).toLocaleString() : "?"} rows`
                          : "—";

                      return (
                        <>
                          <tr
                            key={a.id}
                            onClick={() => setExpandedRow(isExpanded ? null : a.id)}
                            className={`cursor-pointer transition-colors ${suspicious ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-gray-50/50"}`}
                          >
                            <td className="px-5 py-3">
                              <div className="font-medium text-gray-900 text-xs truncate max-w-[150px]">{a.student_name}</div>
                              <div className="text-xs text-gray-400 truncate max-w-[150px]">{a.student_email}</div>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
                                  {meta.label}
                                </span>
                                {suspicious && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-50 border-red-200 text-red-700">
                                    <ShieldAlert className="w-3 h-3" /> Suspicious
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500 max-w-[220px]">
                              <span className="truncate block">{summaryText || "—"}</span>
                              {category && (
                                <span className="mt-0.5 inline-block text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                  {category}
                                </span>
                              )}
                              {purpose && (
                                <span className="mt-0.5 inline-block text-[11px] text-purple-600 bg-purple-50 border border-purple-100 rounded px-1.5 py-0.5">
                                  {purpose}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-3 py-3 text-gray-300">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${a.id}-expanded`} className={suspicious ? "bg-red-50/40" : "bg-gray-50/40"}>
                              <td colSpan={5} className="px-5 py-4">
                                <div className="space-y-2 text-xs">
                                  {promptText && (
                                    <div>
                                      <p className="font-semibold text-gray-600 mb-1">Full prompt / description</p>
                                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap bg-white border border-gray-100 rounded-lg px-3 py-2">
                                        {promptText}
                                      </p>
                                    </div>
                                  )}
                                  {category && (
                                    <div>
                                      <p className="font-semibold text-gray-600 mb-1">Data category</p>
                                      <p className="text-blue-700 font-medium">{category}</p>
                                    </div>
                                  )}
                                  {purpose && (
                                    <div>
                                      <p className="font-semibold text-gray-600 mb-1">Declared usage</p>
                                      <p className="text-purple-700 font-medium">{purpose}</p>
                                    </div>
                                  )}
                                  {a.action_type === "dataset_downloaded" && (
                                    <div className="text-gray-500">
                                      Table: <strong>{String(a.details.table_name ?? "—")}</strong> ·{" "}
                                      Rows: <strong>{a.details.rows != null ? Number(a.details.rows).toLocaleString() : "—"}</strong>
                                    </div>
                                  )}
                                  {suspicious && (
                                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700">
                                      <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                      <span>This prompt contains potentially suspicious keywords. Review the content above to determine if it violates academic integrity policies.</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
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
              {addOk    && <p className="mt-2 text-xs text-green-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Invitation sent — the student will receive an email with an "Accept Invitation" link.</p>}
            </div>
            <StudentTable rows={students} loading={loadingStudents} filter="all"
              actionId={actionId} onApprove={handleApprove} onReject={handleReject} onRemove={handleRemoveStudent} />
          </div>
        )}

        {tab === "prompts" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={promptSearch}
                onChange={(e) => setPromptSearch(e.target.value)}
                placeholder="Search by student name or prompt text…"
                className="flex-1 text-sm focus:outline-none bg-transparent"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingPrompts ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading prompt history…</div>
              ) : prompts.length === 0 ? (
                <EmptyState icon={<MessageSquare className="w-5 h-5 text-gray-300" />} text="No prompts recorded yet." />
              ) : (() => {
                const filtered = prompts.filter((p) => {
                  const q = promptSearch.toLowerCase();
                  return !q || p.student_name?.toLowerCase().includes(q) || p.prompt_text?.toLowerCase().includes(q);
                });
                return filtered.length === 0 ? (
                  <EmptyState icon={<Search className="w-5 h-5 text-gray-300" />} text="No results match your search." />
                ) : (
                  <div className="divide-y divide-gray-50">
                    {filtered.map((p) => (
                      <div key={p.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{p.student_name}</span>
                            <span className="text-xs text-gray-400">{p.student_email}</span>
                            {p.source === "flagged" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                                <AlertTriangle className="w-3 h-3" /> Flagged
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-100">
                                <CheckCircle className="w-3 h-3" /> Successful
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                            {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {p.source === "flagged" && p.flag_reason && (
                          <p className="text-xs text-amber-700 mb-1">
                            <span className="font-medium">Flag reason:</span> {p.flag_reason}
                          </p>
                        )}
                        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-700 leading-relaxed">
                          {p.prompt_text}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {tab === "restrictions" && (
          <div className="space-y-5">
            {loadingRestrictions ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
            ) : (
              <>
                {/* System Keywords */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                    <p className="text-sm font-semibold text-gray-800">System-level Trigger Words</p>
                    <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Read-only</span>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs text-gray-500 mb-3">
                      These keywords are automatically detected in all student prompts. Prompts containing them are flagged for your review.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUSPICIOUS_KEYWORDS.map((kw) => (
                        <span key={kw} className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Custom Keywords */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-purple-500" />
                    <p className="text-sm font-semibold text-gray-800">Custom Trigger Words</p>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    <p className="text-xs text-gray-500">
                      Add words specific to your course. <strong>Flag</strong> → prompt is flagged for your review but generation proceeds. <strong>Block</strong> → student cannot generate with this keyword.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                        placeholder="e.g. SSN, credit card, patient record…"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <select
                        value={newKeywordAction}
                        onChange={(e) => setNewKeywordAction(e.target.value as "flag" | "block")}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="flag">Flag</option>
                        <option value="block">Block</option>
                      </select>
                      <button onClick={handleAddKeyword} disabled={savingRestriction || !newKeyword.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                    {restrictions.filter((r) => r.restriction_type === "keyword").length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No custom keywords added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {restrictions.filter((r) => r.restriction_type === "keyword").map((r) => (
                          <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-2">
                              {r.action === "block"
                                ? <Ban className="w-3.5 h-3.5 text-red-500" />
                                : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                              <span className="text-sm font-medium text-gray-800">{r.value}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                r.action === "block"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>{r.action === "block" ? "Block" : "Flag"}</span>
                            </div>
                            <button onClick={() => handleDeleteRestriction(r.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Allowed Categories */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">Allowed Data Categories</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Check the categories your students are allowed to generate. If none are checked, all categories are allowed.
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_CATEGORIES.map((cat) => {
                        const isAllowed = restrictions.some((r) => r.restriction_type === "allowed_category" && r.value === cat);
                        return (
                          <label key={cat} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={(e) => handleToggleCategory(cat, e.target.checked)}
                              className="w-4 h-4 accent-purple-600 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700">{cat}</span>
                          </label>
                        );
                      })}
                    </div>
                    {restrictions.some((r) => r.restriction_type === "allowed_category") && (
                      <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700">
                        Students can only generate datasets in the checked categories. Uncheck all to lift this restriction.
                      </div>
                    )}
                  </div>
                </div>

                {/* Allowed Purposes */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">Allowed Declared Purposes</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Check the purposes students are allowed to declare. If none are checked, all purposes are allowed.
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_PURPOSES.map((purpose) => {
                        const isAllowed = restrictions.some((r) => r.restriction_type === "allowed_purpose" && r.value === purpose);
                        return (
                          <label key={purpose} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={(e) => handleTogglePurpose(purpose, e.target.checked)}
                              className="w-4 h-4 accent-purple-600 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700">{purpose}</span>
                          </label>
                        );
                      })}
                    </div>
                    {restrictions.some((r) => r.restriction_type === "allowed_purpose") && (
                      <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700">
                        Students must declare one of the checked purposes. Uncheck all to lift this restriction.
                      </div>
                    )}
                  </div>
                </div>

                {/* Daily Generation Quota */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-800">Daily Generation Quota</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Limit how many datasets a student can generate per day. Set to 0 for no limit.
                    </p>
                  </div>
                  <div className="px-5 py-4 flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={quotaInput}
                      onChange={(e) => setQuotaInput(e.target.value)}
                      placeholder="0 = unlimited"
                      className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button onClick={handleSaveQuota} disabled={savingRestriction}
                      className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                      <Check className="w-4 h-4" /> Save Quota
                    </button>
                    {restrictions.find((r) => r.restriction_type === "quota") && (
                      <span className="text-xs text-green-600 font-medium">
                        Active: {restrictions.find((r) => r.restriction_type === "quota")?.value} datasets/day
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
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
                    <div key={inv.id} className={`px-5 py-4 flex items-center justify-between gap-4 ${!inv.active ? "bg-gray-50/60" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">{inv.course}</span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${inv.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                            {inv.active ? "Active" : "Inactive"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <p className={`text-xs font-mono truncate max-w-[300px] ${inv.active ? "text-gray-400" : "text-gray-300 line-through"}`}>
                          {FRONTEND}/?invite={inv.token}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => copyInviteLink(inv.token, inv.id)} disabled={!inv.active}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-xs font-medium rounded-lg transition-colors">
                          {copiedId === inv.id
                            ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</>
                            : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                        <button onClick={() => handleToggleInvite(inv.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${inv.active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
                          {inv.active ? "Deactivate" : "Activate"}
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
