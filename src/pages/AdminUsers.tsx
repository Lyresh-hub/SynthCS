import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Trash2, BadgeCheck, ShieldAlert, Search, RefreshCw, Ban, ShieldCheck,
  Archive, RotateCcw, AlertTriangle, Clock, Mail, Users, GraduationCap, UserCheck, Zap,
} from "lucide-react";
import { NODE_API } from "../lib/config";

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  email_verified: boolean;
  is_admin: boolean;
  is_instructor: boolean;
  course: string | null;
  instructor: string | null;
  approval_status: string | null;
  created_at: string;
  schema_count: number;
  strike_count: number;
  is_banned: boolean;
  ban_reason: string | null;
  pending_deletion: boolean;
  deletion_scheduled_at: string | null;
  deletion_reason: string | null;
}

interface ArchivedUser {
  archive_id: string;
  user_id: string;
  full_name: string;
  email: string;
  username: string | null;
  schema_count: number;
  archive_reason: string | null;
  archived_at: string;
  deletion_scheduled_at: string | null;
  notified_at: string | null;
  is_banned: boolean;
}

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function ScheduleModal({
  user,
  onConfirm,
  onCancel,
}: {
  user: AdminUser;
  onConfirm: (reason: string, graceDays: number) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [graceDays, setGraceDays] = useState(7);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Schedule Account Deletion</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{user.full_name}</span> will receive an email
              warning and have time to download their data before permanent removal.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Reason <span className="text-gray-300 font-normal normal-case">(sent to user)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Violation of terms of service, abusive behavior…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Grace period
            </label>
            <div className="flex gap-2">
              {[3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setGraceDays(d)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors
                    ${graceDays === d
                      ? "bg-red-600 text-white border-red-600"
                      : "border-gray-200 text-gray-600 hover:border-red-300"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Deletion scheduled for {new Date(Date.now() + graceDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <Mail className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              An email notification will be sent to <strong>{user.email}</strong> with the deletion date
              and a reminder to download their schemas and datasets.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason || "Admin-issued deletion", graceDays)}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Schedule Deletion
          </button>
        </div>
      </div>
    </div>
  );
}

function PermanentDeleteModal({
  user,
  onConfirm,
  onCancel,
}: {
  user: ArchivedUser;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Permanently Delete User</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              This will permanently remove <span className="font-medium text-gray-700">{user.full_name}</span> and
              all their data. <strong>This cannot be undone.</strong>
            </p>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Type <span className="font-mono text-red-600">DELETE</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DELETE"}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const adminId     = localStorage.getItem("user_id") ?? "";
  const isAdminUser = localStorage.getItem("is_admin") === "true";

  const [tab, setTab] = useState<"all" | "instructors" | "students" | "archive">("all");

  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [archived, setArchived] = useState<ArchivedUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  const [scheduleTarget,     setScheduleTarget]     = useState<AdminUser | null>(null);
  const [permDeleteTarget,   setPermDeleteTarget]   = useState<ArchivedUser | null>(null);

  useEffect(() => {
    if (!isAdminUser) { setLocation("/login"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        fetch(`${NODE_API}/api/admin/users?admin_id=${adminId}`),
        fetch(`${NODE_API}/api/admin/archive?admin_id=${adminId}`),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (aRes.ok) setArchived(await aRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}/verify?admin_id=${adminId}`, { method: "PATCH" });
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, email_verified: true } : u));
  }

  async function handleToggleAdmin(user: AdminUser) {
    const res  = await fetch(`${NODE_API}/api/admin/users/${user.id}/toggle-admin?admin_id=${adminId}`, { method: "PATCH" });
    const data = await res.json();
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, is_admin: data.is_admin } : u));
  }

  async function handleToggleInstructor(user: AdminUser) {
    const res  = await fetch(`${NODE_API}/api/admin/users/${user.id}/toggle-instructor?admin_id=${adminId}`, { method: "PATCH" });
    const data = await res.json();
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, is_instructor: data.is_instructor } : u));
  }

  async function handleBan(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}/ban?admin_id=${adminId}&reason=Admin-issued+ban`, { method: "PATCH" });
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, is_banned: true } : u));
  }

  async function handleUnban(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}/unban?admin_id=${adminId}`, { method: "PATCH" });
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, is_banned: false, strike_count: 0, ban_reason: null } : u));
  }

  async function handleRemoveStrikes(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}/remove-strikes?admin_id=${adminId}`, { method: "PATCH" });
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, strike_count: 0, is_banned: false, ban_reason: null } : u));
  }

  async function handleScheduleDeletion(user: AdminUser, reason: string, graceDays: number) {
    setScheduleTarget(null);
    const res = await fetch(`${NODE_API}/api/admin/users/${user.id}/schedule-deletion?admin_id=${adminId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, grace_days: graceDays }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers((p) => p.map((u) =>
        u.id === user.id
          ? { ...u, pending_deletion: true, deletion_scheduled_at: data.deletion_scheduled_at, deletion_reason: reason }
          : u
      ));
      await loadAll();
    }
  }

  async function handleCancelDeletion(userId: string) {
    await fetch(`${NODE_API}/api/admin/users/${userId}/cancel-deletion?admin_id=${adminId}`, { method: "PATCH" });
    setUsers((p) => p.map((u) =>
      u.id === userId ? { ...u, pending_deletion: false, deletion_scheduled_at: null, deletion_reason: null } : u
    ));
    setArchived((p) => p.filter((a) => a.user_id !== userId));
  }

  async function handlePermanentDelete(archiveEntry: ArchivedUser) {
    setPermDeleteTarget(null);
    await fetch(`${NODE_API}/api/admin/users/${archiveEntry.user_id}?admin_id=${adminId}`, { method: "DELETE" });
    setUsers((p) => p.filter((u) => u.id !== archiveEntry.user_id));
    setArchived((p) => p.filter((a) => a.user_id !== archiveEntry.user_id));
  }

  const matchesSearch = (u: AdminUser) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase());

  const filtered = users.filter(matchesSearch);
  const filteredInstructors = users.filter((u) => u.is_instructor && matchesSearch(u));
  const filteredStudents    = users.filter((u) => !u.is_instructor && !u.is_admin && matchesSearch(u));

  const displayedUsers = tab === "instructors" ? filteredInstructors
    : tab === "students" ? filteredStudents
    : filtered;

  const activeUsers  = displayedUsers.filter((u) => !u.pending_deletion);
  const pendingUsers = displayedUsers.filter((u) => u.pending_deletion);

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_,i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-gray-100 mb-3" />
            <div className="h-6 w-14 bg-gray-200 rounded mb-1.5" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        {[...Array(8)].map((_,i) => (
          <div key={i} className="px-4 py-3 border-b border-gray-50 flex gap-4 items-center">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-gray-200 rounded" />
              <div className="h-2.5 w-48 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {scheduleTarget && (
        <ScheduleModal
          user={scheduleTarget}
          onConfirm={(reason, days) => handleScheduleDeletion(scheduleTarget, reason, days)}
          onCancel={() => setScheduleTarget(null)}
        />
      )}
      {permDeleteTarget && (
        <PermanentDeleteModal
          user={permDeleteTarget}
          onConfirm={() => handlePermanentDelete(permDeleteTarget)}
          onCancel={() => setPermDeleteTarget(null)}
        />
      )}

      {/* Summary bar */}
      <div className="flex items-center flex-wrap gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-400" />
          <div><div className="text-2xl font-bold text-gray-900">{users.length}</div><div className="text-xs text-gray-500">Total Users</div></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-purple-400" />
          <div><div className="text-2xl font-bold text-purple-600">{users.filter(u => u.is_instructor).length}</div><div className="text-xs text-gray-500">Instructors</div></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <UserCheck className="w-5 h-5 text-blue-400" />
          <div><div className="text-2xl font-bold text-blue-600">{users.filter(u => !u.is_instructor && !u.is_admin).length}</div><div className="text-xs text-gray-500">Students</div></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-400" />
          <div><div className="text-2xl font-bold text-amber-600">{users.filter(u => u.is_admin).length}</div><div className="text-xs text-gray-500">Admins</div></div>
        </div>
        {archived.length > 0 && (
          <div className="bg-white rounded-xl border border-red-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <span className="text-2xl font-bold text-red-500">{archived.length}</span>
            <span className="text-xs text-gray-500">Pending Deletion</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["all", "instructors", "students", "archive"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "all" && <Users className="w-4 h-4" />}
            {t === "instructors" && <GraduationCap className="w-4 h-4" />}
            {t === "students" && <UserCheck className="w-4 h-4" />}
            {t === "archive" && <Archive className="w-4 h-4" />}
            {t === "all" ? "All Users" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "archive" && archived.length > 0 && (
              <span className="ml-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">{archived.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Users tabs (All / Instructors / Students) ── */}
      {(tab === "all" || tab === "instructors" || tab === "students") && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">
              {tab === "instructors" ? "Instructors" : tab === "students" ? "Students" : "All Users"}
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-36 sm:w-56"
                />
              </div>
              <button onClick={loadAll} title="Refresh" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["User", "Email", "Status", "Role", "Strikes", "Schemas", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeUsers.length === 0 && pendingUsers.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-12 text-sm">No users found</td></tr>
                )}
                {/* Pending-deletion users shown first with a tinted row */}
                {pendingUsers.map((user) => {
                  const days = daysUntil(user.deletion_scheduled_at);
                  return (
                    <tr key={user.id} className="border-b border-red-50 bg-red-50/40 hover:bg-red-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 text-sm truncate">{user.full_name}</div>
                            {user.username && <div className="text-[11px] text-gray-400">@{user.username}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{user.email ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                          <Clock className="w-3 h-3" />
                          Deleting in {days}d
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {user.is_admin
                          ? <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">Admin</span>
                          : <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">User</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {user.strike_count > 0
                          ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{user.strike_count}/3</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{user.schema_count}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleCancelDeletion(user.id)}
                          title="Cancel deletion"
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* Active users */}
                {activeUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 text-sm truncate">{user.full_name}</div>
                          {user.username && <div className="text-[11px] text-gray-400">@{user.username}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{user.email ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full" title={user.ban_reason ?? ""}>
                          <Ban className="w-3.5 h-3.5" /> Banned
                        </span>
                      ) : user.email_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                          <BadgeCheck className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                          <ShieldAlert className="w-3.5 h-3.5" /> Unverified
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {user.is_admin
                        ? <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">Admin</span>
                        : user.is_instructor
                        ? <div><span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">Instructor</span></div>
                        : <div>
                            <span className="text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">Student</span>
                            {user.course && <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[110px]">{user.course}</div>}
                            {user.instructor && <div className="text-[10px] text-gray-400 truncate max-w-[110px]">under {user.instructor}</div>}
                          </div>}
                    </td>
                    <td className="px-5 py-3.5">
                      {user.strike_count > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            user.strike_count >= 3 ? "bg-red-100 text-red-700" :
                            user.strike_count === 2 ? "bg-amber-100 text-amber-700" :
                            "bg-yellow-50 text-yellow-700"
                          }`}>{user.strike_count}/3</span>
                          <button onClick={() => handleRemoveStrikes(user)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors font-medium whitespace-nowrap">
                            Clear
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{user.schema_count}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {!user.email_verified && (
                          <button onClick={() => handleVerify(user)}
                            className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium">
                            Verify
                          </button>
                        )}
                        {user.id !== adminId && (
                          <button onClick={() => handleToggleAdmin(user)}
                            className="text-xs px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-medium whitespace-nowrap">
                            {user.is_admin ? "Revoke Admin" : "Make Admin"}
                          </button>
                        )}
                        {user.id !== adminId && !user.is_admin && (
                          <button onClick={() => handleToggleInstructor(user)}
                            className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium whitespace-nowrap">
                            {user.is_instructor ? "Revoke Instructor" : "Make Instructor"}
                          </button>
                        )}
                        {user.id !== adminId && !user.is_banned && (
                          <button onClick={() => handleBan(user)} title="Ban user"
                            className="p-1.5 rounded-md text-amber-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {user.id !== adminId && user.is_banned && (
                          <button onClick={() => handleUnban(user)} title="Unban user"
                            className="p-1.5 rounded-md text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors">
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                        {user.id !== adminId && (
                          <button onClick={() => setScheduleTarget(user)} title="Schedule deletion"
                            className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
            Showing {filtered.length} of {users.length} users
          </div>
        </div>
      )}

      {/* ── Archive tab ── */}
      {tab === "archive" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Archived Users</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Users scheduled for permanent deletion. They can still log in and download their data until the deadline.
              </p>
            </div>
            <button onClick={loadAll} title="Refresh" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {archived.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <Archive className="w-10 h-10 text-gray-200" />
              <p className="text-sm">No archived users</p>
              <p className="text-xs text-gray-300">When you schedule a user for deletion, they'll appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["User", "Email", "Reason", "Schemas", "Archived", "Deletion Date", "Notified", "Actions"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archived.map((entry) => {
                    const days = daysUntil(entry.deletion_scheduled_at);
                    const overdue = days === 0 && !!entry.deletion_scheduled_at;
                    return (
                      <tr key={entry.archive_id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${overdue ? "bg-red-50/30" : ""}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {(entry.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 text-sm truncate">{entry.full_name}</div>
                              {entry.username && <div className="text-[11px] text-gray-400">@{entry.username}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{entry.email ?? "—"}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[160px]">
                          <span className="truncate block" title={entry.archive_reason ?? ""}>{entry.archive_reason ?? "—"}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{entry.schema_count}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {new Date(entry.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3.5">
                          {entry.deletion_scheduled_at ? (
                            overdue ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> Overdue
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                                <Clock className="w-3 h-3" /> {days}d left
                              </span>
                            )
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          {entry.notified_at ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                              <Mail className="w-3 h-3" /> Sent
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">Not sent</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCancelDeletion(entry.user_id)}
                              title="Restore user"
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Restore
                            </button>
                            <button
                              onClick={() => setPermDeleteTarget(entry)}
                              title="Delete permanently"
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition-colors font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
            {archived.length} user{archived.length !== 1 ? "s" : ""} pending deletion
          </div>
        </div>
      )}
    </div>
  );
}
