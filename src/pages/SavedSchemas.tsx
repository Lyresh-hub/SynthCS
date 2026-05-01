import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { FileJson, Trash2, Plus, RefreshCw, Search, Play } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";

import { NODE_API } from "../lib/config";

interface Schema {
  id: string;
  name: string;
  table_name: string;
  fields: unknown[];
  created_at: string;
}

function inferType(name: string) {
  const n = name.toLowerCase();
  if (/health|hospital|patient|medical|clinic/.test(n))
    return { type: "Healthcare", color: "bg-green-100 text-green-700" };
  if (/order|sales|product|ecommerce|business|invoice|payment/.test(n))
    return { type: "Business", color: "bg-blue-100 text-blue-700" };
  if (/school|grade|student|education|course/.test(n))
    return { type: "Education", color: "bg-orange-100 text-orange-700" };
  return { type: "Personal", color: "bg-pink-100 text-pink-700" };
}

export default function SavedSchemas() {
  const [, setLocation] = useLocation();
  const userId = localStorage.getItem("user_id") ?? "";

  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchSchemas = async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${NODE_API}/api/schemas/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setSchemas(await res.json());
    } catch {
      setError("Could not load schemas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchemas(); }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`${NODE_API}/api/schemas/${deleteTarget}`, { method: "DELETE" });
    setSchemas((prev) => prev.filter((s) => s.id !== deleteTarget));
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete schema?"
        message="This schema will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Your saved schema templates from Schema Builder</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSchemas} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
              placeholder="Search schemas…"
              className="text-sm bg-white border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
          <button
            onClick={() => setLocation("/schema-builder")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Schema
          </button>
        </div>
      </div>

      {!userId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Sign in to see your saved schemas.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      {loading && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 flex justify-center">
          <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />
        </div>
      )}

      {!loading && !error && userId && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          {schemas.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No saved schemas yet — create one in{" "}
              <button
                onClick={() => setLocation("/schema-builder")}
                className="text-purple-600 hover:underline"
              >
                Schema Builder
              </button>.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Schema Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Table</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Fields</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Created</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schemas.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())).map((schema) => {
                  const { type, color } = inferType(schema.name);
                  const fieldCount = Array.isArray(schema.fields) ? schema.fields.length : 0;
                  return (
                    <tr key={schema.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileJson className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-800 text-xs">{schema.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">{schema.table_name || "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{type}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">{fieldCount} fields</td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(schema.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setLocation(`/schema-builder?load=${schema.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                            title="Open in Schema Builder"
                          >
                            <Play className="w-3 h-3" /> Use
                          </button>
                          <button
                            onClick={() => setDeleteTarget(schema.id)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
