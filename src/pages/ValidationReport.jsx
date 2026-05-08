import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

// ── Score ring drawn with SVG — animates from 0 to the actual score on mount ──
function ScoreRing({ score, status }) {
  const [progress, setProgress] = useState(0);

  // Animate the ring fill after the component mounts
  useEffect(() => {
    const t = setTimeout(() => setProgress(score), 120);
    return () => clearTimeout(t);
  }, [score]);

  const radius   = 54;
  const circ     = 2 * Math.PI * radius;
  const dash     = (progress / 100) * circ;
  const color    = status === "Good" ? "#22c55e" : status === "Acceptable" ? "#f59e0b" : "#ef4444";
  const textColor = status === "Good" ? "text-green-400" : status === "Acceptable" ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
        {/* Background track */}
        <circle cx="72" cy="72" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        {/* Animated progress arc */}
        <circle
          cx="72" cy="72" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {/* Score number in the centre */}
      <div className="text-center z-10">
        <p className="text-3xl font-bold text-white leading-none">{score}%</p>
        <p className={`text-xs font-semibold mt-1 ${textColor}`}>{status}</p>
      </div>
    </div>
  );
}

// ── Horizontal animated bar for individual metric scores ─────────────────────
function MetricBar({ score, delay = 0 }) {
  const [width, setWidth] = useState(0);

  // Stagger the bar animation using the delay prop
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const color = score >= 75 ? "from-green-400 to-emerald-500"
              : score >= 50 ? "from-amber-400 to-yellow-500"
              :               "from-red-400 to-rose-500";

  return (
    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color}`}
        style={{ width: `${width}%`, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </div>
  );
}

// ── Dynamic verdict text based on score — tells the user what the score means ─
function verdict(key, score) {
  if (key === "wasserstein") {
    if (score >= 90) return "Excellent — the value distributions in your synthetic data almost perfectly mirror the original. Values are spread across the same ranges with matching frequencies.";
    if (score >= 75) return "Good — the distributions are largely faithful to the original with only minor deviations in a few columns.";
    if (score >= 50) return "Acceptable — some columns show noticeable differences in how values are spread compared to the original dataset.";
    return "Poor — the synthetic data's value distributions differ significantly from the original. Consider refining the schema or adding more rows.";
  }
  if (key === "correlation") {
    if (score >= 90) return "Excellent — the relationships between columns are nearly perfectly preserved. If age and salary increase together in the original, they do so in the synthetic data too.";
    if (score >= 75) return "Good — most inter-column relationships are maintained with minor deviations.";
    if (score >= 50) return "Acceptable — some column relationships are partially preserved but others may differ from the original.";
    return "Poor — the correlations between columns are significantly lost. The synthetic data may not reflect real-world relationships.";
  }
  if (key === "utility") {
    if (score >= 75) return "Excellent — a machine learning model trained on this synthetic data performs well when tested on real data. This dataset is suitable for AI/ML training.";
    if (score >= 50) return "Good — the synthetic data retains enough statistical structure to be useful for light machine learning tasks.";
    if (score >= 25) return "Acceptable — ML utility is limited but this is normal for general-purpose datasets. The data is still suitable for testing, demos, and software development.";
    return "Low — the synthetic data is not ideal for training ML models, which is common. It remains fully usable for academic testing and software development purposes.";
  }
}

// ── Main validation report page ───────────────────────────────────────────────
export default function ValidationReport() {
  const [, setLocation] = useLocation();

  // Read report data passed via sessionStorage from DataPreview
  // sessionStorage is cleared immediately so the data is not cached across sessions
  const [report] = useState(() => {
    const raw = sessionStorage.getItem("validation_report");
    sessionStorage.removeItem("validation_report");
    return raw ? JSON.parse(raw) : null;
  });

  // Redirect to downloads if no report data is found (e.g., user navigated here directly)
  useEffect(() => {
    if (!report) setLocation("/downloads");
  }, [report]);

  if (!report) return null;

  const { datasetName, rowCount, columnCount, overall_score, status, metrics } = report;

  // The three metrics in display order, with icons and contextual info
  const metricDefs = [
    {
      key:   "wasserstein",
      icon:  "≋",
      title: "Distribution Similarity",
      what:  "Measures how closely the value ranges and frequencies of each column match the original dataset.",
      how:   "Computed using the Wasserstein distance — the statistical \"effort\" needed to transform one distribution into another. A lower distance means a higher similarity score.",
    },
    {
      key:   "correlation",
      icon:  "⊡",
      title: "Correlation Preservation",
      what:  "Measures whether the relationships between columns are maintained — for example, if age and salary tend to increase together.",
      how:   "Computed by comparing the Pearson correlation matrix of the original dataset against the synthetic one. The smaller the difference, the higher the score.",
    },
    {
      key:   "utility",
      icon:  "⚙",
      title: "ML Utility (TSTR)",
      what:  "Tests whether a machine learning model trained on the synthetic data can still make accurate predictions on real data.",
      how:   "Uses a Train on Synthetic, Test on Real (TSTR) approach with a Random Forest classifier. The score reflects how close the synthetic model's accuracy is to a model trained on real data.",
    },
  ];

  // Sort per-column wasserstein scores from highest to lowest for the breakdown section
  const perColumn = Object.entries(metrics.wasserstein?.per_column || {})
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero header — dark purple gradient with dataset name and score ring ── */}
      <div className="bg-gradient-to-br from-[#1E1347] via-[#2d1b69] to-[#1a0f3c] px-6 py-10">
        <div className="max-w-3xl mx-auto">

          {/* Back button */}
          <button
            onClick={() => setLocation("/preview")}
            className="flex items-center gap-1.5 text-purple-300 hover:text-white text-sm mb-8 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Preview
          </button>

          {/* Dataset info + score ring side by side */}
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <p className="text-purple-300 text-xs font-medium uppercase tracking-widest mb-2">Validation Report</p>
              <h1 className="text-2xl font-bold text-white leading-tight">{datasetName}</h1>
              <p className="text-purple-300/70 text-sm mt-1">{rowCount?.toLocaleString()} rows · {columnCount} columns</p>

              {/* What "overall score" means */}
              <p className="text-purple-200/60 text-xs mt-4 max-w-sm leading-relaxed">
                The overall score is a weighted average of the three metrics below —
                Distribution Similarity and Correlation each carry 40%, ML Utility carries 20%.
              </p>
            </div>

            {/* Animated circular score ring */}
            <ScoreRing score={overall_score} status={status} />
          </div>
        </div>
      </div>

      {/* ── Three metric cards ─────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Metric Breakdown</h2>

        {metricDefs.map(({ key, icon, title, what, how }, idx) => {
          const m     = metrics[key];
          const score = m?.score ?? 0;
          const badgeBg   = score >= 75 ? "bg-green-100 text-green-700"
                          : score >= 50 ? "bg-amber-100 text-amber-700"
                          :               "bg-red-100 text-red-600";

          return (
            <div key={key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

              {/* Card header — icon, title, score badge */}
              <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Icon badge */}
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-lg text-purple-600 flex-shrink-0">
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{what}</p>
                  </div>
                </div>
                {/* Score + verdict badge */}
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-gray-900">{score}%</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeBg}`}>
                    {score >= 75 ? "Good" : score >= 50 ? "Acceptable" : "Poor"}
                  </span>
                </div>
              </div>

              {/* Animated progress bar */}
              <div className="px-6 pb-4">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <BarFill score={score} delay={200 + idx * 150} />
                </div>
              </div>

              {/* Two info sections — How it works + What your score means */}
              <div className="border-t border-gray-50 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-50">
                <div className="px-6 py-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">How it's computed</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{how}</p>
                </div>
                <div className="px-6 py-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">What your score means</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{verdict(key, score)}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Per-column score breakdown ──────────────────────────────────────── */}
        {perColumn.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-800">Per-Column Distribution Scores</p>
              <p className="text-xs text-gray-400 mt-0.5">
                How closely each column's value distribution matches the original dataset.
              </p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {perColumn.map(([col, score], idx) => (
                <div key={col}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 font-medium truncate max-w-[60%]">{col}</span>
                    <span className={`text-xs font-semibold ${
                      score >= 75 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500"
                    }`}>{score}%</span>
                  </div>
                  {/* Staggered animated bar per column */}
                  <BarFill score={score} delay={400 + idx * 60} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer note ─────────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-gray-400 pb-8">
          Scores above 75% are considered Good · Generated by SynthCS Statistical Validation Engine
        </p>
      </div>
    </div>
  );
}

// ── Reusable animated bar used in metric cards and per-column section ─────────
function BarFill({ score, delay = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const color = score >= 75 ? "bg-green-400" : score >= 50 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${width}%`, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </div>
  );
}
