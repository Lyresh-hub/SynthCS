import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Trash2, BadgeCheck, ShieldAlert, Search, RefreshCw } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";

import { NODE_API } from "../lib/config";

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  email_verified: boolean;
  is_admin: boolean;
  created_at: string;
  schema_count: number;
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const adminId     = localStorage.getItem("user_id") ?? "";
  const isAdminUser = localStorage.getItem("is_admin") === "true";

  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (!isAdminUser) { setLocation("/login"); return; }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${NODE_API}/api/admin/users?admin_id=${adminId}`);
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}/verify?admin_id=${adminId}`, { method: "PATCH" });
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, email_verified: true } : u));
  }

  async function handleDelete(user: AdminUser) {
    await fetch(`${NODE_API}/api/admin/users/${user.id}?admin_id=${adminId}`, { method: "DELETE" });
    setUsers((p) => p.filter((u) => u.id !== user.id));
    setDeleteTarget(null);
  }

  async function handleToggleAdmin(user: AdminUser) {
    const res  = await fetch(`${NODE_API}/api/admin/users/${user.id}/toggle-admin?admin_id=${adminId}`, { method: "PATCH" });
    const data = await res.json();
    setUsers((p) => p.map((u) => u.id === user.id ? { ...u, is_admin: data.is_admin } : u));
  }

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete user?"
        message={`This will permanently delete "${deleteTarget?.full_name}" and all their data. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Summary bar */}
      <div className="flex items-center gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-900">{users.length}</span>
          <span className="text-xs text-gray-500">Total Users</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-green-600">{users.filter(u => u.email_verified).length}</span>
          <span className="text-xs text-gray-500">Verified</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-amber-500">{users.filter(u => !u.email_verified).length}</span>
          <span className="text-xs text-gray-500">Unverified</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-purple-600">{users.filter(u => u.is_admin).length}</span>
          <span className="text-xs text-gray-500">Admins</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">All Users</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-56"
              />
            </div>
            <button onClick={load} title="Refresh" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["User", "Email", "Status", "Role", "Schemas", "Joined", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12 text-sm">No users found</td></tr>
              )}
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{user.full_name}</div>
                        {user.username && <div className="text-[11px] text-gray-400">@{user.username}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{user.email ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    {user.email_verified ? (
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
                    {user.is_admin ? (
                      <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">Admin</span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">User</span>
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
                      {user.id !== adminId && (
                        <button onClick={() => setDeleteTarget(user)}
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
    </div>
  );
}
