import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Download, FileSpreadsheet, Search, Trash2, Clock, RefreshCw, Eye } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";

import { NODE_API, PYTHON_API } from "../lib/config";


interface Dataset {
  id: string;
  name: string;
  kaggle_ref: string | null;
  python_dataset_id: string | null;
  row_count: number;
  status: string;
  created_at: string;
  expires_at: string;
}

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysRemaining(expiresAt);
  if (days <= 3)
    return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{days}d left</span>;
  if (days <= 7)
    return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{days}d left</span>;
  return <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{days}d left</span>;
}

export default function Downloads() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const userId = localStorage.getItem("user_id");
  const [, setLocation] = useLocation();

  const handlePreview = (ds: Dataset) => {
    const q = new URLSearchParams({
      id:   ds.python_dataset_id ?? "",
      name: ds.name,
      rows: String(ds.row_count),
      ref:  ds.kaggle_ref ?? "",
    });
    setLocation(`/preview?${q}`);
  };

  const fetchDatasets = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res = await fetch(`${NODE_API}/api/datasets/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setDatasets(await res.json());
    } catch {
      setError("Could not load datasets. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDatasets(); }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`${NODE_API}/api/datasets/${deleteTarget}`, { method: "DELETE" });
    setDatasets((prev) => prev.filter((d) => d.id !== deleteTarget));
    setDeleteTarget(null);
  };

  const filtered = datasets.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.kaggle_ref ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete dataset?"
        message="This dataset will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Generated datasets · available for 30 days</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchDatasets} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
              placeholder="Search downloads…"
              className="text-sm bg-white border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Not logged in */}
      {!userId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Sign in to see your generated datasets.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 flex justify-center">
          <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />
        </div>
      )}

      {/* Table */}
      {!loading && !error && userId && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              {datasets.length === 0
                ? "No datasets yet — generate one in Schema Builder."
                : "No results match your search."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Dataset</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Source</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Rows</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">Created</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Expires</span>
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ds) => (
                  <tr key={ds.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-800 text-xs">{ds.name}</p>
                          {ds.kaggle_ref && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{ds.kaggle_ref}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        CTGAN
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {ds.row_count.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {new Date(ds.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <ExpiryBadge expiresAt={ds.expires_at} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 justify-end">
                        {ds.python_dataset_id ? (
                          <>
                            <button
                              onClick={() => handlePreview(ds)}
                              className="flex items-center gap-1 px-2.5 py-1 border border-purple-200 rounded-md text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors"
                              title="Preview data"
                            >
                              <Eye className="w-3 h-3" /> Preview
                            </button>
                            <a
                              href={`${PYTHON_API}/api/download/${ds.python_dataset_id}`}
                              download
                              className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                          </>
                        ) : (
                          <span className="text-xs text-gray-300">No file</span>
                        )}
                        <button
                          onClick={() => setDeleteTarget(ds.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Expiry legend */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-3">
          <span className="text-green-600">● &gt;7 days</span>
          <span className="text-amber-600">● 3–7 days</span>
          <span className="text-red-600">● &lt;3 days</span>
          · Datasets are automatically deleted after 30 days.
        </p>
      )}
    </div>
  );
}
