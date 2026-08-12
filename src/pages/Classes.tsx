import { useState, useEffect } from "react";
import { GraduationCap, User, BookOpen, LogOut, Clock, CheckCircle, XCircle } from "lucide-react";
import { NODE_API } from "../lib/config";
import { pushNotification } from "../lib/notifications";

type ClassEntry = {
  id: string;
  course: string;
  status: "pending" | "approved" | "rejected";
  enrolled_at: string;
  instructor_id: string;
  instructor_name: string;
};

const STATUS_META = {
  approved: { label: "Enrolled",        color: "bg-green-50 text-green-700 border-green-200",  icon: CheckCircle },
  pending:  { label: "Pending Approval", color: "bg-amber-50 text-amber-700 border-amber-200",  icon: Clock },
  rejected: { label: "Rejected",         color: "bg-red-50 text-red-700 border-red-200",         icon: XCircle },
};

export default function Classes() {
  const userId = localStorage.getItem("user_id") ?? "";
  const [classes,  setClasses]  = useState<ClassEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`${NODE_API}/api/student/${userId}/classes`)
      .then((r) => r.json())
      .then((data: ClassEntry[]) => {
        if (!Array.isArray(data)) return;

        // Detect status changes since last visit → push notifications
        const prevRaw = localStorage.getItem("student_class_statuses");
        const prev: Record<string, string> = prevRaw ? JSON.parse(prevRaw) : {};
        data.forEach((c) => {
          const was = prev[c.id];
          if (was === "pending" && c.status === "approved") {
            pushNotification({ title: "Class Approved", message: `${c.instructor_name} approved your enrollment in ${c.course}`, dataset_id: c.id });
          }
          if (was === "pending" && c.status === "rejected") {
            pushNotification({ title: "Enrollment Rejected", message: `${c.instructor_name} declined your enrollment in ${c.course}`, dataset_id: c.id });
          }
        });
        // Save current statuses
        const next: Record<string, string> = {};
        data.forEach((c) => { next[c.id] = c.status; });
        localStorage.setItem("student_class_statuses", JSON.stringify(next));

        setClasses(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleUnenroll = async (classId: string) => {
    if (!confirm("Are you sure you want to unenroll from this class?")) return;
    setRemoving(classId);
    try {
      await fetch(`${NODE_API}/api/student/${userId}/classes/${classId}`, { method: "DELETE" });
      setClasses((prev) => prev.filter((c) => c.id !== classId));
    } finally {
      setRemoving(null);
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="max-w-xl space-y-4">
      {classes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-gray-300" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700">No classes yet</p>
            <p className="text-sm text-gray-400 mt-1">
              You are not enrolled in any class. Use an invite link from your instructor or wait for them to send you one.
            </p>
          </div>
        </div>
      ) : (
        classes.map((c) => {
          const meta = STATUS_META[c.status] ?? STATUS_META.pending;
          const StatusIcon = meta.icon;
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-purple-600 to-violet-500 px-6 py-4 flex items-center justify-between">
                <p className="text-base font-bold text-white">{c.course}</p>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-white/10 border-white/20 text-white`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {meta.label}
                </span>
              </div>

              <div className="px-6 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Instructor</p>
                    <p className="text-sm font-semibold text-gray-800">{c.instructor_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Enrolled</p>
                    <p className="text-sm text-gray-600">{new Date(c.enrolled_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>

                {c.status === "pending" && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                    Waiting for your instructor to approve your enrollment.
                  </div>
                )}
                {c.status === "rejected" && (
                  <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                    Your enrollment was declined. Contact your instructor for more information.
                  </div>
                )}
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {c.status === "approved" ? "Your activity is monitored for academic integrity." : "You can unenroll if this was accidental."}
                </p>
                <button
                  onClick={() => handleUnenroll(c.id)}
                  disabled={removing === c.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                  <LogOut className="w-3.5 h-3.5" />
                  {removing === c.id ? "Unenrolling…" : "Unenroll"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
