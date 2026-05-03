import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

import { PYTHON_API } from "../lib/config";
const ROWS_PER_PAGE = 25;
const TABS = ["Table View", "JSON", "Statistics"];

// ── helpers ──────────────────────────────────────────────────────────────────

function computeStats(columns, rows) {
  return columns.map((col) => {
    const values = rows.map((r) => r[col]);
    const nulls  = values.filter((v) => v === null || v === "" || v === undefined);
    const nonNull = values.filter((v) => v !== null && v !== "" && v !== undefined);
    const nums   = nonNull.map(Number).filter((n) => !isNaN(n));
    const isNum  = nums.length >= nonNull.length * 0.8 && nonNull.length > 0;

    return {
      col,
      nullRate: values.length ? ((nulls.length / values.length) * 100).toFixed(1) : "0.0",
      unique: new Set(nonNull.map(String)).size,
      min: isNum ? Math.min(...nums) : "—",
      max: isNum ? Math.max(...nums) : "—",
      mean: isNum ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "—",
    };
  });
}

function qualityChecks(columns, rows) {
  const checks = [];
  const nullRates = columns.map((col) => {
    const vals = rows.map((r) => r[col]);
    return vals.filter((v) => v === null || v === "" || v === undefined).length / vals.length;
  });
  const maxNull = Math.max(...nullRates);

  checks.push({ label: "No fully-null columns",    pass: columns.length > 0 && maxNull < 1 });
  checks.push({ label: "Null rate under 50%",       pass: maxNull < 0.5 });
  checks.push({ label: "At least 1 row generated",  pass: rows.length > 0 });
  checks.push({ label: "Column headers present",    pass: columns.length > 0 });

  const emailCol = columns.find((c) => c.toLowerCase().includes("email"));
  if (emailCol) {
    const sample = rows.slice(0, 20).map((r) => r[emailCol]).filter(Boolean);
    const valid  = sample.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)));
    checks.push({ label: "Email format valid", pass: valid.length >= sample.length * 0.8 });
  }

  const dateCol = columns.find((c) => /date|created|updated|time/i.test(c));
  if (dateCol) {
    const sample = rows.slice(0, 20).map((r) => r[dateCol]).filter(Boolean);
    const valid  = sample.filter((v) => !isNaN(Date.parse(String(v))));
    checks.push({ label: "Date values parseable", pass: valid.length >= sample.length * 0.8 });
  }

  return checks;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DataPreview() {
  const [, setLocation] = useLocation();

  // Read dataset info from sessionStorage (set by SchemaBuilder before navigating here).
  // We can't use window.location.search because replaceState always clears the URL to "/".
  const stored        = JSON.parse(sessionStorage.getItem("preview_params") || "{}");
  const datasetId     = stored.id   || "";
  const datasetName   = stored.name || "Dataset";
  const totalRowsMeta = Number(stored.rows) || 0;
  const kaggleRef     = stored.ref  || "";

  const [tab, setTab]             = useState("Table View");
  const [page, setPage]           = useState(1);
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [validation, setValidation]   = useState(null);
  const [validating, setValidating]   = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv");
  const [exporting, setExporting]       = useState(false);

  const exportFormats = [
    { id: "csv",   label: "CSV" },
    { id: "json",  label: "JSON" },
    { id: "sql",   label: "SQL" },
    { id: "excel", label: "Excel" },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const csvRes = await fetch(`${PYTHON_API}/api/download/${datasetId}`);
      const csvText = await csvRes.text();
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const allRows = lines.slice(1).map((line) => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) ?? line.split(",");
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/^"|"$/g, ""); });
        return obj;
      });

      let blob, filename;

      if (exportFormat === "csv") {
        blob = new Blob([csvText], { type: "text/csv" });
        filename = `${datasetName}.csv`;

      } else if (exportFormat === "json") {
        blob = new Blob([JSON.stringify(allRows, null, 2)], { type: "application/json" });
        filename = `${datasetName}.json`;

      } else if (exportFormat === "sql") {
        const tableName = datasetName.toLowerCase().replace(/[^a-z0-9]/g, "_");
        const colDefs = headers.map((h) => `  \`${h}\` TEXT`).join(",\n");
        let sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${colDefs}\n);\n\n`;
        allRows.forEach((row) => {
          const vals = headers.map((h) => {
            const v = row[h];
            return v === "" || v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
          }).join(", ");
          sql += `INSERT INTO \`${tableName}\` (${headers.map((h) => `\`${h}\``).join(", ")}) VALUES (${vals});\n`;
        });
        blob = new Blob([sql], { type: "text/plain" });
        filename = `${datasetName}.sql`;

      } else if (exportFormat === "excel") {
        const ws = XLSX.utils.json_to_sheet(allRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, datasetName.slice(0, 31));
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        filename = `${datasetName}.xlsx`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!datasetId) { setLocation("/downloads"); return; }
    sessionStorage.removeItem("preview_params");
    fetch(`${PYTHON_API}/api/preview/${datasetId}?limit=200`)
      .then((r) => { if (!r.ok) throw new Error("Preview unavailable"); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    setValidating(true);
    fetch(`${PYTHON_API}/api/validate/${datasetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setValidation(d); setValidating(false); })
      .catch(() => setValidating(false));
  }, [datasetId]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-600">
      {error} — Make sure the Python service is running on port 8000.
    </div>
  );

  const { columns, rows, total_rows } = data;
  const totalPages  = Math.ceil(rows.length / ROWS_PER_PAGE);
  const pageRows    = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
  const stats       = computeStats(columns, rows);
  const checks      = qualityChecks(columns, rows);

  // ── render tab content ───────────────────────────────────────────────────

  const renderTable = () => (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-400 w-10">#</th>
              {columns.map((c) => (
                <th key={c} className="py-2 px-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2 px-3 text-xs text-gray-300">
                  {(page - 1) * ROWS_PER_PAGE + i + 1}
                </td>
                {columns.map((c) => (
                  <td key={c} className="py-2 px-3 text-xs text-gray-700 max-w-[180px] truncate">
                    {row[c] === null || row[c] === undefined || row[c] === ""
                      ? <span className="text-gray-300 italic">null</span>
                      : String(row[c])
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
        <span>
          Showing {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, rows.length)} of{" "}
          <strong>{total_rows.toLocaleString()}</strong> rows
          {rows.length < total_rows && ` (${rows.length} loaded for preview)`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`dots-${i}`} className="px-1 text-gray-300">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors
                    ${page === p ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}
                >{p}</button>
              )
            )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >›</button>
        </div>
      </div>
    </>
  );

  const renderJSON = () => (
    <pre className="p-4 text-xs text-slate-700 bg-slate-50 overflow-auto max-h-[520px] rounded-lg m-3 leading-relaxed">
      {JSON.stringify(rows.slice(0, 5), null, 2)}
    </pre>
  );

  const renderStats = () => (
    <div className="p-4 space-y-4 overflow-auto max-h-[580px]">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Rows",   value: total_rows.toLocaleString() },
          { label: "Columns",      value: columns.length },
          { label: "Preview Rows", value: rows.length.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Per-column stats */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Column", "Null Rate", "Unique Values", "Min", "Max", "Mean"].map((h) => (
                <th key={h} className="py-2 px-3 text-left font-medium text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.col} className="border-b border-gray-50">
                <td className="py-2 px-3 font-medium text-gray-800">{s.col}</td>
                <td className="py-2 px-3">
                  <span className={`font-medium ${parseFloat(s.nullRate) > 20 ? "text-amber-600" : "text-green-600"}`}>
                    {s.nullRate}%
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-600">{s.unique.toLocaleString()}</td>
                <td className="py-2 px-3 text-gray-500">{s.min}</td>
                <td className="py-2 px-3 text-gray-500">{s.max}</td>
                <td className="py-2 px-3 text-gray-500">{s.mean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── main render ──────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 h-full">
      {/* ── Main card ── */}
      <div className="flex-1 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">

        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white text-sm">
              👁
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900">{datasetName}</span>
                <span className="bg-green-100 text-green-700 text-[11px] px-2 py-0.5 rounded-full font-medium">
                  ● Generated
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {columns.length} columns · {total_rows.toLocaleString()} rows
                {kaggleRef && ` · source: ${kaggleRef}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/downloads")}
              className="px-3 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <div className="flex items-center border border-gray-200 rounded-md overflow-hidden text-xs">
              {exportFormats.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setExportFormat(f.id)}
                  className={`px-2.5 py-1.5 transition-colors ${exportFormat === f.id ? "bg-purple-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-60"
            >
              {exporting ? "⏳" : "↓"} Export {exportFormat.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px
                ${tab === t
                  ? "border-purple-600 text-purple-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {tab === "Table View"  && renderTable()}
          {tab === "JSON"        && renderJSON()}
          {tab === "Statistics"  && renderStats()}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="w-52 flex flex-col gap-3 flex-shrink-0">

        {/* Quality checks */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-3">✦ Quality Checks</p>
          <div className="space-y-2">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={`text-sm ${c.pass ? "text-green-500" : "text-red-400"}`}>
                  {c.pass ? "✓" : "✗"}
                </span>
                <span className="text-xs text-gray-600">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-3">Summary</p>
          <div className="space-y-2">
            {[
              ["Dataset",  datasetName],
              ["Rows",     total_rows.toLocaleString()],
              ["Columns",  columns.length],
              ["Preview",  `${rows.length} rows`],
              ["Source",   kaggleRef || "CTGAN"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-gray-400">{k}</span>
                <span className="font-medium text-gray-700 truncate max-w-[100px] text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Validation */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-3">⚡ Validation</p>

          {validating && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              Analysing…
            </div>
          )}

          {!validating && !validation && (
            <p className="text-xs text-gray-400">Not available</p>
          )}

          {!validating && validation && (() => {
            const { overall_score, status, metrics } = validation;
            const badgeColor =
              status === "Good"       ? "bg-green-100 text-green-700"  :
              status === "Acceptable" ? "bg-yellow-100 text-yellow-700" :
                                        "bg-red-100 text-red-600";
            const barColor =
              status === "Good"       ? "bg-green-500"  :
              status === "Acceptable" ? "bg-yellow-400" :
                                        "bg-red-500";

            return (
              <div className="space-y-3">
                {/* Overall score */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Overall Score</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${overall_score}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-800 w-9 text-right">{overall_score}%</span>
                  </div>
                </div>

                {/* Metric cards */}
                {[
                  { key: "wasserstein", icon: "≋" },
                  { key: "correlation", icon: "⊡" },
                  { key: "utility",     icon: "⚙" },
                ].map(({ key, icon }) => {
                  const m = metrics[key];
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-gray-500">{icon} {m.label}</span>
                        <span className="text-xs font-semibold text-gray-800">{m.score}%</span>
                      </div>
                      <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.score >= 75 ? "bg-green-400" : m.score >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
                          style={{ width: `${m.score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Expandable per-column details */}
                {Object.keys(metrics.wasserstein.per_column || {}).length > 0 && (
                  <div>
                    <button
                      onClick={() => setDetailsOpen((o) => !o)}
                      className="text-[11px] text-purple-600 hover:underline flex items-center gap-1"
                    >
                      {detailsOpen ? "▾" : "▸"} View per-column scores
                    </button>
                    {detailsOpen && (
                      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {Object.entries(metrics.wasserstein.per_column).map(([col, score]) => (
                          <div key={col} className="flex justify-between text-[11px]">
                            <span className="text-gray-500 truncate max-w-[100px]">{col}</span>
                            <span className={`font-medium ${score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                              {score}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Export format + download */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-gray-800 mb-2">Export Format</p>
          <div className="grid grid-cols-2 gap-1.5">
            {exportFormats.map((f) => (
              <button
                key={f.id}
                onClick={() => setExportFormat(f.id)}
                className={`py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  exportFormat === f.id
                    ? "bg-purple-600 text-white border-purple-600"
                    : "border-gray-200 text-gray-600 hover:border-purple-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {exporting ? "Exporting…" : `↓ Download ${exportFormat.toUpperCase()}`}
          </button>
        </div>
        <button
          onClick={() => setLocation("/downloads")}
          className="w-full py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back to Downloads
        </button>
      </div>
    </div>
  );
}
