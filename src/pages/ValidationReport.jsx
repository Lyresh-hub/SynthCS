import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

function ScoreRing({ score, status }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => { const t = setTimeout(() => setProgress(score), 120); return () => clearTimeout(t); }, [score]);
  const radius = 54, circ = 2 * Math.PI * radius, dash = (progress / 100) * circ;
  const color = status === "Good" ? "#22c55e" : status === "Acceptable" ? "#f59e0b" : "#ef4444";
  const textColor = status === "Good" ? "text-green-400" : status === "Acceptable" ? "text-amber-400" : "text-red-400";
  return (
    <div className="relative flex items-center justify-center w-36 h-36 flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle cx="72" cy="72" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div className="text-center z-10">
        <p className="text-3xl font-bold text-white leading-none">{score}%</p>
        <p className={`text-xs font-semibold mt-1 ${textColor}`}>{status}</p>
      </div>
    </div>
  );
}

function AnimBar({ score, delay = 0, light = false }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), delay); return () => clearTimeout(t); }, [score, delay]);
  const c = score >= 75 ? (light ? "bg-white" : "bg-green-400")
          : score >= 50 ? (light ? "bg-amber-200" : "bg-amber-400")
          :               (light ? "bg-red-300"   : "bg-red-400");
  const track = light ? "bg-white/20" : "bg-gray-100";
  return (
    <div className={`h-2 ${track} rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full ${c}`} style={{ width: `${w}%`, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

function verdict(key, score) {
  if (key === "wasserstein") {
    if (score >= 90) return "Excellent — distributions nearly perfectly mirror the original dataset.";
    if (score >= 75) return "Good — distributions are largely faithful with minor deviations.";
    if (score >= 50) return "Acceptable — some columns show noticeable distribution differences.";
    return "Poor — distributions differ significantly. Try generating more rows.";
  }
  if (key === "correlation") {
    if (score >= 90) return "Excellent — inter-column relationships nearly perfectly preserved.";
    if (score >= 75) return "Good — most column relationships maintained with minor deviations.";
    if (score >= 50) return "Acceptable — some relationships partially preserved.";
    return "Poor — correlations significantly lost in the synthetic data.";
  }
  if (key === "utility") {
    if (score >= 75) return "Excellent — ML model trained on synthetic data performs well on real data.";
    if (score >= 50) return "Good — retains enough structure for light ML tasks.";
    if (score >= 25) return "Acceptable — limited ML utility, normal for general-purpose datasets.";
    return "Low — not ideal for ML training, but still usable for testing and demos.";
  }
  if (key === "privacy") {
    if (score >= 99) return "Excellent — no synthetic row is an exact copy of any real record.";
    if (score >= 95) return "Good — nearly all synthetic rows are unique vs the original.";
    if (score >= 80) return "Acceptable — small fraction of rows match real records exactly.";
    return "Risk — notable portion of synthetic rows are exact duplicates of real records.";
  }
}

export default function ValidationReport({ inlineData } = {}) {
  const [, setLocation] = useLocation();
  const [report] = useState(() => {
    if (inlineData) return inlineData;
    const raw = sessionStorage.getItem("validation_report");
    sessionStorage.removeItem("validation_report");
    return raw ? JSON.parse(raw) : null;
  });
  useEffect(() => { if (!inlineData && !report) setLocation("/downloads"); }, [report, inlineData]);
  if (!report) return null;

  const { datasetName, rowCount, columnCount, overall_score, status, metrics, col_stats = {}, null_rates = {} } = report;

  const metricDefs = [
    {
      key: "wasserstein", icon: "≋", title: "Distribution Similarity",
      what: "How closely each column's value ranges and frequencies match the original dataset.",
      how: "Wasserstein distance — statistical effort to transform one distribution into another.",
      grad: "from-violet-600 to-purple-700", ring: "#a78bfa",
    },
    {
      key: "correlation", icon: "⊡", title: "Correlation Preservation",
      what: "Whether inter-column relationships are maintained in the synthetic data.",
      how: "Pearson correlation matrix difference between original and synthetic datasets.",
      grad: "from-blue-600 to-indigo-700", ring: "#60a5fa",
    },
    {
      key: "utility", icon: "⚙", title: "ML Utility (TSTR)",
      what: "Whether an ML model trained on synthetic data can still predict real data accurately.",
      how: "Train on Synthetic, Test on Real (TSTR) with Random Forest classifier.",
      grad: "from-emerald-500 to-teal-600", ring: "#34d399",
    },
    {
      key: "privacy", icon: "🛡", title: "Privacy Risk Score",
      what: "How many synthetic rows are exact copies of original records. Higher = better.",
      how: "Counts synthetic rows that are exact string-matches of any real row.",
      grad: "from-orange-500 to-amber-600", ring: "#fb923c",
    },
  ];

  const perColumn   = Object.entries(metrics.wasserstein?.per_column || {}).sort(([, a], [, b]) => b - a);
  const colStatRows = Object.entries(col_stats);
  const nullRows    = Object.entries(null_rates);

  const wScore = metrics.wasserstein?.score ?? 0;
  const cScore = metrics.correlation?.score ?? 0;
  const uScore = metrics.utility?.score ?? 0;
  const pScore = metrics.privacy?.score ?? 100;

  const recommendations = [];
  if (wScore < 75) recommendations.push({ grad: "from-amber-500 to-orange-600", icon: "≋", label: "Distribution", title: "Improve Distribution Similarity", text: "Generate more rows — larger counts let the Gaussian Copula better approximate marginal distributions. Try 5,000+ rows." });
  if (cScore < 75) recommendations.push({ grad: "from-blue-500 to-indigo-600", icon: "⊡", label: "Correlation", title: "Correlation Gap Detected", text: "Some inter-column relationships are partially lost. For tighter correlation, use a real-world Kaggle dataset as the base." });
  if (uScore < 50) recommendations.push({ grad: "from-purple-500 to-violet-600", icon: "⚙", label: "ML Utility", title: "Low ML Utility is Normal", text: "General-purpose synthetic datasets often score low on TSTR. A real-world base dataset significantly improves this metric." });
  if (pScore < 90) recommendations.push({ grad: "from-red-500 to-rose-600", icon: "🛡", label: "Privacy", title: "Some Rows Match Real Records", text: "A fraction of synthetic rows are exact matches of real records. Add more unique fields or increase value diversity." });
  if (recommendations.length === 0) recommendations.push({ grad: "from-emerald-500 to-teal-600", icon: "✓", label: "All Good", title: "All Metrics Look Great", text: "Your synthetic dataset scores well across all validation dimensions. Ready for academic testing and software development." });

  return (
    <div className={inlineData ? "" : "min-h-screen bg-gray-100"}>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1E1347] via-[#2d1b69] to-[#1a0f3c] px-6 pt-8 pb-0 rounded-xl overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {!inlineData && (
            <button onClick={() => setLocation("/preview")}
              className="flex items-center gap-1.5 text-purple-300 hover:text-white text-sm mb-6 transition-colors group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              Back to Preview
            </button>
          )}

          <div className="flex items-start justify-between gap-6 flex-wrap pb-6">
            {/* Left: info */}
            <div className="flex-1 min-w-0">
              <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-widest mb-1">Validation Report</p>
              <h1 className="text-2xl font-bold text-white truncate">{datasetName}</h1>
              <p className="text-purple-300/70 text-sm mt-1">{rowCount?.toLocaleString()} rows · {columnCount} columns</p>
              <p className="text-purple-200/50 text-xs mt-3 max-w-sm leading-relaxed">
                Weighted average: Distribution 40% · Correlation 40% · ML Utility 20% · Privacy reported separately.
              </p>

              {/* Mini metric chips */}
              <div className="grid grid-cols-2 gap-2 mt-4 max-w-xs">
                {metricDefs.map(({ key, icon, title }) => {
                  const s = metrics[key]?.score ?? 0;
                  const c = s >= 75 ? "text-green-400" : s >= 50 ? "text-amber-400" : "text-red-400";
                  return (
                    <div key={key} className="bg-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] text-white/50 truncate">{title.split(" ")[0]}</p>
                        <p className={`text-sm font-bold ${c}`}>{s}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: score ring */}
            <ScoreRing score={overall_score} status={status} />
          </div>

          {/* Colored tabs strip at bottom of hero — bleeds into next section */}
          <div className="grid grid-cols-4 -mx-6">
            {metricDefs.map(({ key, grad }) => {
              const s = metrics[key]?.score ?? 0;
              return <div key={key} className={`h-1 bg-gradient-to-r ${grad} opacity-${s >= 75 ? "100" : s >= 50 ? "60" : "30"}`} />;
            })}
          </div>
        </div>
      </div>

      {/* ── 4 Metric Cards ────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metricDefs.map(({ key, icon, title, what, how, grad }) => {
            const m = metrics[key];
            const score = m?.score ?? 0;
            const isGood = score >= 75, isPoor = score < 50;
            const statusLabel = isGood ? "Good" : isPoor ? "Poor" : "Acceptable";
            return (
              <div key={key} className="rounded-2xl overflow-hidden shadow-sm">
                {/* Colored gradient top */}
                <div className={`bg-gradient-to-br ${grad} px-5 pt-5 pb-5`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest">{title}</p>
                      <p className="text-4xl font-bold text-white mt-1 leading-none">{score}%</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg">{icon}</div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                        ${isGood ? "bg-green-400/30 text-green-100" : isPoor ? "bg-red-400/30 text-red-100" : "bg-amber-400/30 text-amber-100"}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  <AnimBar score={score} delay={200} light />
                  <p className="text-white/60 text-[11px] mt-2 leading-relaxed">{what}</p>
                </div>
                {/* White bottom: how + verdict */}
                <div className="bg-white grid grid-cols-2 divide-x divide-gray-100">
                  <div className="px-4 py-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">How computed</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{how}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Score meaning</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">{verdict(key, score)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Per-Column + Stats side by side ───────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Per-column distribution — dark slate */}
        {perColumn.length > 0 && (
          <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-semibold">Per-Column Distribution</p>
                <p className="text-slate-400 text-xs mt-0.5">How each column's spread matches the original.</p>
              </div>
              <span className="text-[11px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{perColumn.length} cols</span>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
              {perColumn.map(([col, score], idx) => (
                <div key={col}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-300 font-medium truncate max-w-[60%]">{col}</span>
                    <span className={`text-xs font-bold ${score >= 75 ? "text-green-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>{score}%</span>
                  </div>
                  <AnimBar score={score} delay={300 + idx * 30} light />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats comparison table */}
        {colStatRows.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 bg-slate-800">
              <p className="text-white text-sm font-semibold">Statistical Comparison</p>
              <p className="text-slate-400 text-xs mt-0.5">Real vs synthetic — mean, std, range.</p>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-slate-700 text-slate-200">
                    <th className="py-2 px-3 text-left font-medium">Column</th>
                    <th className="py-2 px-2 text-center font-medium" colSpan={2}>Mean</th>
                    <th className="py-2 px-2 text-center font-medium border-l border-slate-600" colSpan={2}>Std</th>
                    <th className="py-2 px-2 text-center font-medium border-l border-slate-600" colSpan={2}>Min / Max</th>
                  </tr>
                  <tr className="bg-slate-800 text-slate-400 text-[10px]">
                    <th className="py-1 px-3"></th>
                    <th className="py-1 px-2 text-center">Real</th>
                    <th className="py-1 px-2 text-center">Synth</th>
                    <th className="py-1 px-2 text-center border-l border-slate-700">Real</th>
                    <th className="py-1 px-2 text-center">Synth</th>
                    <th className="py-1 px-2 text-center border-l border-slate-700" colSpan={2}>Real · Synth</th>
                  </tr>
                </thead>
                <tbody>
                  {colStatRows.map(([col, s], i) => {
                    const diff = s.real_mean !== 0 ? Math.abs((s.synth_mean - s.real_mean) / s.real_mean * 100) : 0;
                    const dc = diff < 5 ? "text-green-600" : diff < 15 ? "text-amber-600" : "text-red-500";
                    const db = diff < 5 ? "bg-green-50" : diff < 15 ? "bg-amber-50" : "bg-red-50";
                    return (
                      <tr key={col} className={`border-b border-gray-50 hover:bg-purple-50/30 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                        <td className="py-2 px-3 font-semibold text-gray-800 max-w-[90px] truncate">
                          {col}
                          {diff > 0 && <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${db} ${dc}`}>Δ{diff.toFixed(1)}%</span>}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-500">{s.real_mean.toLocaleString()}</td>
                        <td className={`py-2 px-2 text-center font-semibold ${dc}`}>{s.synth_mean.toLocaleString()}</td>
                        <td className="py-2 px-2 text-center text-gray-400 border-l border-gray-100">{s.real_std.toLocaleString()}</td>
                        <td className="py-2 px-2 text-center text-gray-400">{s.synth_std.toLocaleString()}</td>
                        <td className="py-2 px-2 text-center text-gray-400 border-l border-gray-100 text-[10px]">
                          {s.real_min} – {s.real_max}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-400 text-[10px]">
                          {s.synth_min} – {s.synth_max}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Δ&lt;5% close</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Δ5–15% minor</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Δ&gt;15% gap</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Null Rate — full width indigo gradient ────────────────────────────── */}
      {nullRows.length > 0 && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-semibold">Null Rate Comparison</p>
                <p className="text-white/60 text-xs mt-0.5">Missing-value rate per column — real vs synthetic.</p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/70">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-white inline-block" />Real</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-indigo-200 inline-block" />Synthetic</span>
              </div>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4">
              {nullRows.map(([col, rates]) => {
                const diff = Math.abs(rates.synth - rates.real);
                return (
                  <div key={col}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-white truncate max-w-[65%]">{col}</span>
                      {diff > 5
                        ? <span className="text-amber-300 text-[10px] font-bold">Δ{diff.toFixed(1)}%</span>
                        : <span className="text-white/40 text-[10px]">{rates.real}%</span>}
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white/80 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, rates.real || 0.5)}%` }} />
                      </div>
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-200 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, rates.synth || 0.5)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Recommendations — colored gradient tiles ──────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-8">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recommendations</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recommendations.map((r, i) => (
            <div key={i} className={`bg-gradient-to-br ${r.grad} rounded-2xl p-5 shadow-sm`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg flex-shrink-0">{r.icon}</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-xs font-bold">{r.title}</span>
                    <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-medium">{r.label}</span>
                  </div>
                  <p className="text-white/80 text-[11px] leading-relaxed">{r.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Scores above 75% are considered Good · Generated by SynthCS Statistical Validation Engine
        </p>
      </div>

    </div>
  );
}
