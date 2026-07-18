import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { LogOut, Clock, CheckCircle, XCircle, Users } from "lucide-react";
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

type Tab = "pending" | "all";

export default function InstructorDashboard() {
  const [, setLocation] = useLocation();
  const instructorId   = localStorage.getItem("user_id")   ?? "";
  const instructorName = localStorage.getItem("user_name") ?? "";

  const [students, setStudents] = useState<Student[]>([]);
  const [tab, setTab]           = useState<Tab>("pending");
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!instructorId || localStorage.getItem("is_instructor") !== "true") {
      setLocation("/login");
      return;
    }
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/instructor/students?instructor_id=${encodeURIComponent(instructorId)}`);
      const json = await res.json();
      if (res.ok) setStudents(json);
    } catch {
      // silently fail — table stays empty
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/approve/${studentId}`, { method: "POST" });
      if (res.ok) {
        setStudents((prev) =>
          prev.map((s) => s.id === studentId ? { ...s, approval_status: "approved" } : s)
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (studentId: string) => {
    setActionId(studentId);
    try {
      const res = await fetch(`${BACKEND}/instructor/reject/${studentId}`, { method: "POST" });
      if (res.ok) {
        setStudents((prev) =>
          prev.map((s) => s.id === studentId ? { ...s, approval_status: "rejected" } : s)
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("is_admin");
    localStorage.removeItem("is_instructor");
    localStorage.removeItem("last_path");
    setLocation("/login");
  };

  const displayed = tab === "pending"
    ? students.filter((s) => s.approval_status === "pending")
    : students;

  const pendingCount = students.filter((s) => s.approval_status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
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
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-purple-200/70 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Student Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve students registered under your class.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit mb-6 shadow-sm">
          <button
            onClick={() => setTab("pending")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "pending"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pending
            {pendingCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === "pending" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-600"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            All Students
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
            }`}>
              {students.length}
            </span>
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading students…</div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Users className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">
                {tab === "pending" ? "No students pending approval." : "No students found for your class."}
              </p>
            </div>
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
                  {displayed.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900 truncate max-w-[180px]">{student.full_name}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[180px]">{student.email}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{student.course ?? "—"}</td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        {new Date(student.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-4">
                        {student.approval_status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-600 border border-yellow-100">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                        {student.approval_status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-100">
                            <CheckCircle className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {student.approval_status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-500 border border-red-100">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {student.approval_status === "pending" && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(student.id)}
                              disabled={actionId === student.id}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(student.id)}
                              disabled={actionId === student.id}
                              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {student.approval_status !== "pending" && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
