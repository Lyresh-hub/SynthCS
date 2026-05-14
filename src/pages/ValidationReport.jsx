import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

// ── Animated circular score ring ──────────────────────────────────────────────
function ScoreRing({ score, status }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setProgress(score), 120);
    return () => clearTimeout(t);
  }, [score]);

  const radius = 54;
  const circ   = 2 * Math.PI * radius;
  const dash   = (progress / 100) * circ;
  const color  = status === "Good" ? "#22c55e" : status === "Acceptable" ? "#f59e0b" : "#ef4444";
  const textColor = status === "Good" ? "text-green-400" : status === "Acceptable" ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="72" cy="72" r={radius}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="text-center z-10">
        <p className="text-3xl font-bold text-white leading-none">{score}%</p>
        <p className={`text-xs font-semibold mt-1 ${textColor}`}>{status}</p>
      </div>
    </div>
  );
}

// ── Animated fill bar ─────────────────────────────────────────────────────────
function BarFill({ score, delay = 0, colorClass }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const auto = colorClass || (score >= 75 ? "bg-green-400" : score >= 50 ? "bg-amber-400" : "bg-red-400");

  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${auto}`}
        style={{ width: `${width}%`, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </div>
  );
}

// ── Verdict text for each metric ──────────────────────────────────────────────
function verdict(key, score) {
  if (key === "wasserstein") {
    if (score >= 90) return "Excellent — distributions almost perfectly mirror the original. Values spread across the same ranges with matching frequencies.";
    if (score >= 75) return "Good — distributions are largely faithful with only minor deviations in a few columns.";
    if (score >= 50) return "Acceptable — some columns show noticeable differences in how values are spread.";
    return "Poor — distributions differ significantly. Consider refining the schema or generating more rows.";
  }
  if (key === "correlation") {
    if (score >= 90) return "Excellent — inter-column relationships are nearly perfectly preserved.";
    if (score >= 75) return "Good — most column relationships are maintained with minor deviations.";
    if (score >= 50) return "Acceptable — some relationships are partially preserved but others may differ.";
    return "Poor — correlations are significantly lost. Synthetic data may not reflect real-world relationships.";
  }
  if (key === "utility") {
    if (score >= 75) return "Excellent — an ML model trained on this synthetic data performs well on real data. Suitable for AI/ML training.";
    if (score >= 50) return "Good — retains enough structure for light machine learning tasks.";
    if (score >= 25) return "Acceptable — ML utility is limited but normal for general-purpose datasets. Suitable for testing and demos.";
    return "Low — not ideal for ML training, which is common. Fully usable for academic testing and software development.";
  }
  if (key === "privacy") {
    if (score >= 99) return "Excellent — no synthetic row is an exact copy of any real record. Safe to share without exposing original data.";
    if (score >= 95) return "Good — nearly all synthetic rows are unique relative to the original dataset.";
    if (score >= 80) return "Acceptable — a small fraction of synthetic rows match real records exactly. Review before sharing externally.";
    return "Risk — a notable portion of synthetic rows are exact duplicates of real records. Consider adding more noise or diversity.";
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ValidationReport() {
  const [, setLocation] = useLocation();

  const [report] = useState(() => {
    const raw = sessionStorage.getItem("validation_report");
    sessionStorage.removeItem("validation_report");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (!report) setLocation("/downloads");
  }, [report]);

  if (!report) return null;

  const {
    datasetName, rowCount, columnCount,
    overall_score, status, metrics,
    col_stats  = {},
    null_rates = {},
  } = report;

  const metricDefs = [
    {
      key:   "wasserstein",
      icon:  "≋",
      title: "Distribution Similarity",
      what:  "Measures how closely the value ranges and frequencies of each column match the original dataset.",
      how:   "Uses Wasserstein distance — the statistical effort to transform one distribution into another. Lower distance = higher score.",
    },
    {
      key:   "correlation",
      icon:  "⊡",
      title: "Correlation Preservation",
      what:  "Measures whether inter-column relationships are maintained — e.g. if age and salary increase together.",
      how:   "Compares the Pearson correlation matrix of original vs synthetic. Smaller difference = higher score.",
    },
    {
      key:   "utility",
      icon:  "⚙",
      title: "ML Utility (TSTR)",
      what:  "Tests whether an ML model trained on synthetic data can still predict accurately on real data.",
      how:   "Train on Synthetic, Test on Real (TSTR) with a Random Forest. Score = how close synthetic model accuracy is to real-trained.",
    },
    {
      key:   "privacy",
      icon:  "🛡",
      title: "Privacy Risk Score",
      what:  "Measures how many synthetic rows are exact copies of original records. Higher = better privacy.",
      how:   "Checks each synthetic row against the full set of real rows (string match). Score = (1 − match rate) × 100.",
    },
  ];

  const perColumn   = Object.entries(metrics.wasserstein?.per_column || {}).sort(([, a], [, b]) => b - a);
  const colStatRows = Object.entries(col_stats);
  const nullRows    = Object.entries(null_rates);

  // ── Recommendations ────────────────────────────────────────────────────────
  const recommendations = [];
  const wScore = metrics.wasserstein?.score ?? 0;
  const cScore = metrics.correlation?.score ?? 0;
  const uScore = metrics.utility?.score ?? 0;
  const pScore = metrics.privacy?.score ?? 100;

  if (wScore < 75) recommendations.push({
    accent: "border-amber-400 bg-amber-50",
    badge:  "bg-amber-100 text-amber-700",
    icon: "≋", label: "Distribution",
    title: "Improve Distribution Similarity",
    text:  "Consider generating more rows — larger row counts allow the Gaussian Copula to better approximate marginal distributions. Try 5,000+ rows for complex schemas.",
  });
  if (cScore < 75) recommendations.push({
    accent: "border-blue-400 bg-blue-50",
    badge:  "bg-blue-100 text-blue-700",
    icon: "⊡", label: "Correlation",
    title: "Correlation Gap Detected",
    text:  "Some inter-column relationships are partially lost. This is expected for schemas with many independent or categorical fields. For tighter correlation, use a Kaggle dataset as the training base.",
  });
  if (uScore < 50) recommendations.push({
    accent: "border-purple-400 bg-purple-50",
    badge:  "bg-purple-100 text-purple-700",
    icon: "⚙", label: "ML Utility",
    title: "Low ML Utility is Normal",
    text:  "General-purpose synthetic datasets often score low on TSTR. If ML training is the goal, using a real-world base dataset (Kaggle) will significantly improve this metric.",
  });
  if (pScore < 90) recommendations.push({
    accent: "border-red-400 bg-red-50",
    badge:  "bg-red-100 text-red-700",
    icon: "🛡", label: "Privacy",
    title: "Some Rows Match Real Records",
    text:  "A fraction of synthetic rows are exact string-matches of real records. Consider adding more unique fields or increasing the diversity of generated values before sharing externally.",
  });
  if (recommendations.length === 0) recommendations.push({
    accent: "border-green-400 bg-green-50",
    badge:  "bg-green-100 text-green-700",
    icon: "✓", label: "All Good",
    title: "All Metrics Look Great",
    text:  "Your synthetic dataset scores well across all validation dimensions. It is ready for use in academic testing, software development, and demonstration purposes.",
  });

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1E1347] via-[#2d1b69] to-[#1a0f3c] px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setLocation("/preview")}
            className="flex items-center gap-1.5 text-purple-300 hover:text-white text-sm mb-8 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Preview
          </button>

          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="text-purple-300 text-xs font-medium uppercase tracking-widest mb-2">Validation Report</p>
              <h1 className="text-2xl font-bold text-white leading-tight">{datasetName}</h1>
              <p className="text-purple-300/70 text-sm mt-1">{rowCount?.toLocaleString()} rows · {columnCount} columns</p>
              <p className="text-purple-200/60 text-xs mt-4 max-w-sm leading-relaxed">
                Overall score is a weighted average — Distribution Similarity and Correlation each carry 40%, ML Utility carries 20%. Privacy is reported separately.
              </p>
            </div>
            <ScoreRing score={overall_score} status={status} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── 4 Metric Cards ────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Metric Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metricDefs.map(({ key, icon, title, what, how }, idx) => {
              const m     = metrics[key];
              const score = m?.score ?? 0;
              const isPoor = score < 50;
              const isGood = score >= 75;
              const badgeBg   = isGood ? "bg-green-100 text-green-700" : isPoor ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700";
              const ringColor = isGood ? "text-green-500" : isPoor ? "text-red-500" : "text-amber-500";
              const borderAccent = isGood ? "border-t-green-400" : isPoor ? "border-t-red-400" : "border-t-amber-400";

              return (
                <div key={key} className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 ${borderAccent} overflow-hidden`}>
                  <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-base text-purple-600 flex-shrink-0">
                        {icon}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-800 leading-tight">{title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{what}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-2xl font-bold ${ringColor}`}>{score}%</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeBg}`}>
                        {isGood ? "Good" : isPoor ? "Poor" : "Acceptable"}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 pb-3">
                    <BarFill score={score} delay={200 + idx * 150} />
                  </div>
                  <div className="border-t border-gray-50 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-50">
                    <div className="px-5 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">How it's computed</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{how}</p>
                    </div>
                    <div className="px-5 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">What your score means</p>
                      <p className="text-[11px] text-gray-600 leading-relaxed">{verdict(key, score)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Per-column Distribution Scores ────────────────────────────────── */}
        {perColumn.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Per-Column Distribution Scores</p>
                <p className="text-xs text-gray-400 mt-0.5">How closely each column's value spread matches the original.</p>
              </div>
              <span className="text-xs text-gray-400">{perColumn.length} columns</span>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {perColumn.map(([col, score], idx) => (
                <div key={col}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 font-medium truncate max-w-[55%]">{col}</span>
                    <span className={`text-xs font-semibold ${score >= 75 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500"}`}>
                      {score}%
                    </span>
                  </div>
                  <BarFill score={score} delay={400 + idx * 40} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Statistics Comparison Table ────────────────────────────────────── */}
        {colStatRows.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-800">Statistical Comparison</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Mean, standard deviation, and range — real vs synthetic for each numeric column.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-2.5 px-4 text-left font-semibold text-gray-500">Column</th>
                    <th className="py-2.5 px-3 text-center font-semibold text-gray-400" colSpan={2}>Mean</th>
                    <th className="py-2.5 px-3 text-center font-semibold text-gray-400 border-l border-gray-100" colSpan={2}>Std Dev</th>
                    <th className="py-2.5 px-3 text-center font-semibold text-gray-400 border-l border-gray-100" colSpan={2}>Min</th>
                    <th className="py-2.5 px-3 text-center font-semibold text-gray-400 border-l border-gray-100" colSpan={2}>Max</th>
                  </tr>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] text-gray-400">
                    <th className="py-1 px-4"></th>
                    <th className="py-1 px-2 text-center font-medium">Real</th>
                    <th className="py-1 px-2 text-center font-medium">Synth</th>
                    <th className="py-1 px-2 text-center font-medium border-l border-gray-100">Real</th>
                    <th className="py-1 px-2 text-center font-medium">Synth</th>
                    <th className="py-1 px-2 text-center font-medium border-l border-gray-100">Real</th>
                    <th className="py-1 px-2 text-center font-medium">Synth</th>
                    <th className="py-1 px-2 text-center font-medium border-l border-gray-100">Real</th>
                    <th className="py-1 px-2 text-center font-medium">Synth</th>
                  </tr>
                </thead>
                <tbody>
                  {colStatRows.map(([col, s], i) => {
                    const meanDiff = s.real_mean !== 0
                      ? Math.abs((s.synth_mean - s.real_mean) / s.real_mean * 100)
                      : 0;
                    const diffColor = meanDiff < 5 ? "text-green-600" : meanDiff < 15 ? "text-amber-600" : "text-red-500";
                    const diffBg    = meanDiff < 5 ? "bg-green-50"   : meanDiff < 15 ? "bg-amber-50"   : "bg-red-50";

                    return (
                      <tr key={col} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-gray-800">{col}</span>
                          {meanDiff > 0 && (
                            <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${diffBg} ${diffColor}`}>
                              Δ{meanDiff.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center text-gray-600">{s.real_mean.toLocaleString()}</td>
                        <td className={`py-2.5 px-2 text-center font-medium ${diffColor}`}>{s.synth_mean.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500 border-l border-gray-100">{s.real_std.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500">{s.synth_std.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500 border-l border-gray-100">{s.real_min.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500">{s.synth_min.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500 border-l border-gray-100">{s.real_max.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-center text-gray-500">{s.synth_max.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-gray-50 flex items-center gap-4 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Δ &lt; 5% — Very close</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Δ 5–15% — Minor deviation</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Δ &gt; 15% — Notable gap</span>
            </div>
          </div>
        )}

        {/* ── Null Rate Comparison ───────────────────────────────────────────── */}
        {nullRows.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Null Rate Comparison</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Missing-value rates per column — real vs synthetic.
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-gray-500"><span className="w-3 h-1.5 rounded-full bg-indigo-400 inline-block" /> Real</span>
                <span className="flex items-center gap-1.5 text-gray-500"><span className="w-3 h-1.5 rounded-full bg-purple-300 inline-block" /> Synthetic</span>
              </div>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
              {nullRows.map(([col, rates]) => {
                const diff = Math.abs(rates.synth - rates.real);
                return (
                  <div key={col}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[55%]">{col}</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        {diff > 5 && (
                          <span className="text-amber-500 font-medium">Δ{diff.toFixed(1)}%</span>
                        )}
                        <span className="text-gray-400">{rates.real}% / {rates.synth}%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-400"
                          style={{ width: `${Math.min(100, rates.real)}%`, transition: "width 1s ease" }}
                        />
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-300"
                          style={{ width: `${Math.min(100, rates.synth)}%`, transition: "width 1s ease" }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recommendations ───────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Recommendations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommendations.map((r, i) => (
              <div key={i} className={`rounded-xl border-l-4 p-4 ${r.accent}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.badge}`}>{r.label}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800 mb-1">{r.title}</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">{r.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-gray-400 pb-8">
          Scores above 75% are considered Good · Generated by SynthCS Statistical Validation Engine
        </p>

      </div>
    </div>
  );
}
