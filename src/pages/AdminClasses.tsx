import { useState, useEffect, useCallback } from "react";
import { BookOpen, Activity, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Plus, Copy, Trash2, X } from "lucide-react";
import { NODE_API as BACKEND } from "../lib/config";

const FRONTEND_URL = "https://synthcs.site";

type Student = {
  id: string;
  full_name: string;
  email: string;
  approval_status: string;
  created_at: string;
};

type Course = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_email: string;
  course: string;
  token: string;
  active: boolean;
  created_at: string;
  students: Student[];
};

type Instructor = { id: string; full_name: string };

type ActivityEntry = {
  id: string;
  instructor_name: string;
  instructor_email: string;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
};

type Tab = "courses" | "activity";

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
};

const ACTION_COLORS: Record<string, string> = {
  student_approved: "text-green-600 bg-green-50 border-green-100",
  student_rejected: "text-red-500 bg-red-50 border-red-100",
  prompt_approved:  "text-blue-600 bg-blue-50 border-blue-100",
  prompt_rejected:  "text-orange-600 bg-orange-50 border-orange-100",
};

function AddCourseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (instructorId: string, course: string) => Promise<void> }) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [instructorId, setInstructorId] = useState("");
  const [course, setCourse] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/api/instructors`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setInstructors(d) : [])
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!instructorId || !course.trim()) return;
    setSaving(true);
    try { await onCreate(instructorId, course.trim()); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add Course</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Instructor</label>
            <select
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              <option value="">Select instructor…</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Course Name</label>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Data Science, Thesis Writing…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5 text-xs text-purple-700">
            An invitation link will be generated. Students who use it will be automatically enrolled under this instructor and course.
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !instructorId || !course.trim()}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-lg transition-colors"
          >
            {saving ? "Creating…" : "Create Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminClasses() {
  const adminId = localStorage.getItem("user_id") ?? "";

  const [tab, setTab]             = useState<Tab>("courses");
  const [courses,  setCourses]    = useState<Course[]>([]);
  const [activity, setActivity]   = useState<ActivityEntry[]>([]);
  const [loadingCourses,  setLoadingCourses]  = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [copied,   setCopied]     = useState<string | null>(null);
  const [showAdd,  setShowAdd]    = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/courses?admin_id=${adminId}`);
      if (res.ok) setCourses(await res.json());
    } finally { setLoadingCourses(false); }
  }, [adminId]);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/activity?admin_id=${adminId}`);
      if (res.ok) setActivity(await res.json());
    } finally { setLoadingActivity(false); }
  }, [adminId]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { if (tab === "activity") fetchActivity(); }, [tab, fetchActivity]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleCopy = (token: string) => {
    const link = `${FRONTEND_URL}/?invite=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleCreate = async (instructorId: string, course: string) => {
    const res = await fetch(`${BACKEND}/api/admin/courses?admin_id=${adminId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructor_id: instructorId, course }),
    });
    if (res.ok) {
      const newCourse = await res.json();
      setCourses((prev) => [newCourse, ...prev]);
      setShowAdd(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this course and its invitation link? Enrolled students will not be affected.")) return;
    setDeletingId(id);
    try {
      await fetch(`${BACKEND}/api/admin/courses/${id}?admin_id=${adminId}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-6">
      {showAdd && <AddCourseModal onClose={() => setShowAdd(false)} onCreate={handleCreate} />}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit shadow-sm">
        <TabBtn active={tab === "courses"}  onClick={() => setTab("courses")}  icon={<BookOpen className="w-3.5 h-3.5" />}  label="Courses" />
        <TabBtn active={tab === "activity"} onClick={() => setTab("activity")} icon={<Activity className="w-3.5 h-3.5" />}  label="Instructor Activity" />
      </div>

      {/* ── Courses ── */}
      {tab === "courses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{courses.length} course{courses.length !== 1 ? "s" : ""} — click a row to see enrolled students</p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Course
            </button>
          </div>

          {loadingCourses ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : courses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-sm text-gray-400">
              No courses yet. Click <strong>Add Course</strong> to create one.
            </div>
          ) : courses.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Course header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                onClick={() => toggleExpand(c.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 flex-shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{c.course}</div>
                    <div className="text-xs text-gray-400">Instructor: {c.instructor_name}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-500">{c.students.length} student{c.students.length !== 1 ? "s" : ""}</span>

                  {/* Copy invite link */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(c.token); }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      copied === c.token
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-700"
                    }`}
                  >
                    <Copy className="w-3 h-3" />
                    {copied === c.token ? "Copied!" : "Copy Link"}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    disabled={deletingId === c.id}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {expanded.has(c.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Invite link preview */}
              <div className="px-5 pb-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] text-gray-400 font-mono truncate max-w-xs">{FRONTEND_URL}/?invite={c.token}</span>
              </div>

              {/* Expanded: student list */}
              {expanded.has(c.id) && (
                <div className="border-t border-gray-100">
                  {c.students.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">No students enrolled yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[480px]">
                        <thead>
                          <tr className="bg-gray-50/60 border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Student</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {c.students.map((s) => {
                            const meta = STATUS_META[s.approval_status] ?? STATUS_META.pending;
                            return (
                              <tr key={s.id} className="hover:bg-gray-50/40 transition-colors">
                                <td className="px-5 py-3 font-medium text-gray-800 text-xs">{s.full_name}</td>
                                <td className="px-5 py-3 text-xs text-gray-400">{s.email}</td>
                                <td className="px-5 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                                    {meta.icon}{meta.label}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-xs text-gray-400">
                                  {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                        {a.details.student_name ? String(a.details.student_name)
                          : a.details.prompt_text ? <span className="truncate block max-w-[240px]">{String(a.details.prompt_text)}</span>
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
