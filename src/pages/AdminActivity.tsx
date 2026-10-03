import { useState } from "react";
import { LogIn, Users, GraduationCap, ShieldAlert, Server, Activity } from "lucide-react";
import LogViewer from "../components/LogViewer";
import { NODE_API as BACKEND } from "../lib/config";

// ── Admin → Activity History ──────────────────────────────────────────────────
// Account and system activity for EVERY user (students and faculty): logins and
// logouts, what instructors did (approved/rejected prompts, added/removed students,
// invite links, restrictions), signups, strikes and bans, datasets, and system
// errors. Prompt content is not shown here — instructors review their students'
// prompts in their own dashboard.

type View = { id: string; label: string; icon: React.ReactNode; description: string; query: Record<string, string> };

const VIEWS: View[] = [
  {
    id: "all", label: "All activity", icon: <Activity className="w-3.5 h-3.5" />,
    description: "Everything that happened in the system, newest first.",
    query: {},
  },
  {
    id: "logins", label: "Logins & logouts", icon: <LogIn className="w-3.5 h-3.5" />,
    description: "Every login, logout, failed login (with the reason), and automatic sign-out of banned accounts.",
    query: { actions: "login_success,logout,login_failed,banned_session_ended" },
  },
  {
    id: "faculty", label: "Faculty actions", icon: <GraduationCap className="w-3.5 h-3.5" />,
    description: "What instructors did: approved or rejected prompts and students, added or removed students, invite links, and class restrictions.",
    query: {
      role: "instructor",
      actions: [
        "prompt_approved", "prompt_rejected", "student_approved", "student_rejected", "student_invited",
        "student_removed", "invite_created", "invite_toggled", "invite_deleted",
        "restriction_added", "restriction_removed", "restrictions_updated",
      ].join(","),
    },
  },
  {
    id: "accounts", label: "Accounts & bans", icon: <ShieldAlert className="w-3.5 h-3.5" />,
    description: "New accounts, registered instructors, email verification, password resets, strikes, bans, and unbans.",
    query: {
      actions: [
        "signup", "instructor_registered", "email_verified", "password_reset_requested",
        "strike_added", "account_banned", "account_unbanned", "strikes_reset", "banned_session_ended",
      ].join(","),
    },
  },
  {
    id: "system", label: "System", icon: <Server className="w-3.5 h-3.5" />,
    description: "Server starts, crashed or slow requests, the generation service going down or recovering, and emails that failed to send.",
    query: { category: "system" },
  },
];

export default function AdminActivity() {
  const adminId = localStorage.getItem("user_id") ?? "";
  const [viewId, setViewId] = useState("logins");
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" /> Activity History
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Activity of all users — students and faculty — plus system events. Prompt content is not shown here;
          instructors review their own students' prompts.
        </p>
      </div>

      {/* Quick views */}
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setViewId(v.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              viewId === v.id ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      <LogViewer
        key={view.id}
        endpoint={`${BACKEND}/api/admin/logs?admin_id=${adminId}`}
        extraQuery={view.query}
        showRoleFilter={view.id !== "faculty"}
        scopeNote={view.description}
      />
    </div>
  );
}
