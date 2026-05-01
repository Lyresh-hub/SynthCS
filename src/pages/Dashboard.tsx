import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Database, TrendingUp, BookMarked, Download,
  Plus, Sparkles, ChevronDown, FileSpreadsheet,
  FileJson, FileCode, RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";

import { NODE_API } from "../lib/config";

interface Schema {
  id: string;
  name: string;
  table_name: string;
  fields: unknown[];
  created_at: string;
}

interface Dataset {
  id: string;
  name: string;
  kaggle_ref: string | null;
  row_count: number;
  created_at: string;
  expires_at: string;
}

const outputFormats = [
  { id: "csv",   label: "CSV",   icon: FileSpreadsheet },
  { id: "json",  label: "JSON",  icon: FileJson },
  { id: "sql",   label: "SQL",   icon: FileCode },
  { id: "excel", label: "Excel", icon: FileSpreadsheet },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (/health|hospital|patient|medical/.test(n)) return "🏥";
  if (/order|sales|product|ecommerce|commerce/.test(n)) return "🛒";
  if (/school|grade|student|education/.test(n)) return "🎓";
  if (/finance|bank|payment|invoice/.test(n)) return "💰";
  if (/user|profile|person|people/.test(n)) return "👤";
  return "🗂️";
}

function formatRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const userId = localStorage.getItem("user_id") ?? "";

  const [schemas, setSchemas]   = useState<Schema[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading]   = useState(true);

  const [rows, setRows]                 = useState(10000);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState("csv");

  const fetchData = async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        fetch(`${NODE_API}/api/schemas/${userId}`).then((r) => r.json()),
        fetch(`${NODE_API}/api/datasets/${userId}`).then((r) => r.json()),
      ]);
      setSchemas(Array.isArray(s) ? s : []);
      setDatasets(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [userId]);

  const totalRows     = datasets.reduce((sum, d) => sum + (d.row_count ?? 0), 0);
  const recentDatasets = datasets.slice(0, 5);
  const recentSchemas  = schemas.slice(0, 4);

  const statsCards = [
    { label: "Datasets Generated", value: loading ? "—" : datasets.length.toLocaleString(), icon: Database },
    { label: "Total Records",      value: loading ? "—" : formatRows(totalRows),             icon: TrendingUp },
    { label: "Schemas Saved",      value: loading ? "—" : schemas.length.toLocaleString(),   icon: BookMarked },
    { label: "Downloads",          value: loading ? "—" : datasets.length.toLocaleString(),  icon: Download },
  ];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-purple-600" />
                </div>
                {loading && <RefreshCw className="w-3.5 h-3.5 text-gray-300 animate-spin" />}
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Quick Generate */}
        <div className="col-span-3 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Quick Generate</h2>
          </div>

          <div className="space-y-4">
            {/* Schema picker */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Saved Schema</label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between border border-gray-200 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className={selectedSchemaId ? "text-gray-800" : "text-gray-400"}>
                    {selectedSchemaId
                      ? (schemas.find((s) => s.id === selectedSchemaId)?.name ?? "Schema")
                      : schemas.length === 0 ? "No saved schemas yet" : "Select a schema…"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {dropdownOpen && schemas.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedSchemaId(""); setDropdownOpen(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-md",
                        !selectedSchemaId ? "bg-purple-50 text-purple-700 font-medium" : "text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      New schema (Schema Builder)
                    </button>
                    {schemas.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSchemaId(s.id); setDropdownOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm transition-colors last:rounded-b-md",
                          selectedSchemaId === s.id ? "bg-purple-50 text-purple-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <span className="block truncate">{s.name}</span>
                        <span className="text-xs text-gray-400">
                          {Array.isArray(s.fields) ? s.fields.length : 0} fields · {timeAgo(s.created_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row slider */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500">Rows</label>
                <span className="text-xs font-semibold text-gray-800">{rows.toLocaleString()}</span>
              </div>
              <input
                type="range" min={10000} max={100000} step={1000} value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="w-full h-1.5 rounded-full accent-purple-600 bg-gray-100 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>10K</span><span>100K</span>
              </div>
            </div>

            {/* Output format */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Output Format</label>
              <div className="grid grid-cols-4 gap-2">
                {outputFormats.map((fmt) => {
                  const Icon = fmt.icon;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2 rounded-md border text-xs font-medium transition-colors",
                        selectedFormat === fmt.id
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-500 hover:border-purple-300 hover:bg-purple-50/50"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={() => setLocation(selectedSchemaId ? `/schema-builder?load=${selectedSchemaId}` : "/schema-builder")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedSchemaId ? "Generate from Schema" : "Open Schema Builder"}
            </button>
            <p className="text-[11px] text-gray-400 text-center -mt-2">
              {selectedSchemaId ? "Schema will be loaded and ready to generate" : "Select a saved schema above or build one from scratch"}
            </p>
          </div>
        </div>

        {/* Saved Schemas */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                <BookMarked className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Saved Schemas</h2>
            </div>
            <button
              onClick={() => setLocation("/saved-schemas")}
              className="text-xs text-purple-600 font-medium hover:underline"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
            </div>
          ) : recentSchemas.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No schemas yet.</p>
          ) : (
            <div className="space-y-1">
              {recentSchemas.map((s) => {
                const fieldCount = Array.isArray(s.fields) ? s.fields.length : 0;
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Database className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                      <div className="text-xs text-gray-400">{fieldCount} fields · {timeAgo(s.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setLocation("/schema-builder")}
            className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-purple-300 hover:text-purple-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Schema
          </button>
        </div>
      </div>

      {/* Recent Datasets */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Recent Datasets</h2>
          <button
            onClick={() => setLocation("/downloads")}
            className="text-xs text-purple-600 font-medium hover:underline"
          >
            View all
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
        ) : recentDatasets.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No datasets yet —{" "}
            <button onClick={() => setLocation("/schema-builder")} className="text-purple-600 hover:underline">
              generate one
            </button>.
          </div>
        ) : (
          <div className="space-y-1">
            {recentDatasets.map((ds) => (
              <div key={ds.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base flex-shrink-0">
                  {categoryIcon(ds.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{ds.name}</div>
                  <div className="text-xs text-gray-400">
                    {ds.kaggle_ref ? ds.kaggle_ref : "CTGAN"} · {ds.row_count.toLocaleString()} rows
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">CSV</span>
                  <span className="text-xs text-gray-400 w-16 text-right">{timeAgo(ds.created_at)}</span>
                  <button
                    onClick={() => setLocation("/downloads")}
                    className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
