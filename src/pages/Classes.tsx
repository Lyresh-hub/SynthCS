import { useState, useEffect } from "react";
import { GraduationCap, User, BookOpen } from "lucide-react";
import { NODE_API } from "../lib/config";

export default function Classes() {
  const userId = localStorage.getItem("user_id") ?? "";
  const [classInfo, setClassInfo] = useState<{ instructor: string; course: string } | null>(() => {
    const instructor = localStorage.getItem("instructor");
    if (instructor) return { instructor, course: localStorage.getItem("course") ?? "" };
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`${NODE_API}/api/users/${userId}`)
      .then((r) => r.json())
      .then((u) => {
        if (u?.instructor) {
          setClassInfo({ instructor: u.instructor, course: u.course ?? "" });
          localStorage.setItem("instructor", u.instructor);
          if (u.course) localStorage.setItem("course", u.course);
        } else {
          setClassInfo(null);
          localStorage.removeItem("instructor");
          localStorage.removeItem("course");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">Loading…</div>
    );
  }

  if (!classInfo) {
    return (
      <div className="max-w-lg mx-auto mt-16 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <GraduationCap className="w-8 h-8 text-gray-300" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-700">No class yet</p>
          <p className="text-sm text-gray-400 mt-1">
            You are not enrolled in any class. Enroll using a class invite link or wait for your instructor to send you an invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-violet-500 px-6 py-5">
          <p className="text-xs font-medium text-purple-200 uppercase tracking-widest mb-1">Enrolled Class</p>
          <p className="text-xl font-bold text-white">{classInfo.course || "My Class"}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Instructor</p>
              <p className="text-sm font-semibold text-gray-800">{classInfo.instructor}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Course / Subject</p>
              <p className="text-sm font-semibold text-gray-800">{classInfo.course || "—"}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Your instructor can view your prompt history and activity. All dataset generation is monitored for academic integrity.
          </p>
        </div>
      </div>
    </div>
  );
}
