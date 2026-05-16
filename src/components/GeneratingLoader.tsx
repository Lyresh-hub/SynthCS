import { Sparkles, Search, Download, Cpu } from "lucide-react";

type LoaderPhase = "generating" | "loading" | "searching" | "augmenting";

const PHASE_CONFIG: Record<LoaderPhase, { icon: React.ReactNode; title: string; sub: string }> = {
  generating: {
    icon: <Sparkles className="w-5 h-5 text-white" />,
    title: "Generating your dataset…",
    sub: "Training the model and synthesizing rows. This may take a few minutes.",
  },
  loading: {
    icon: <Download className="w-5 h-5 text-white" />,
    title: "Preparing your data…",
    sub: "Fetching and processing your dataset.",
  },
  searching: {
    icon: <Search className="w-5 h-5 text-white" />,
    title: "Searching all dataset sources…",
    sub: "Checking Kaggle, Hugging Face, UCI, OpenML, Data.gov.ph & PSA simultaneously.",
  },
  augmenting: {
    icon: <Cpu className="w-5 h-5 text-white" />,
    title: "Augmenting your dataset…",
    sub: "Downloading real data and detecting missing fields from your description.",
  },
};

interface Props {
  phase?: LoaderPhase;
  message?: string;
  sub?: string;
}

export default function GeneratingLoader({ phase = "generating", message, sub }: Props) {
  const cfg = PHASE_CONFIG[phase];

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-8 py-14 shadow-sm flex flex-col items-center gap-6">
      {/* Radar pulse orb */}
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* outermost ping */}
        <span
          className="absolute inset-0 rounded-full bg-purple-100 animate-ping"
          style={{ animationDuration: "2.2s", opacity: 0.5 }}
        />
        {/* middle ping */}
        <span
          className="absolute inset-3 rounded-full bg-purple-200 animate-ping"
          style={{ animationDuration: "2.2s", animationDelay: "0.55s", opacity: 0.4 }}
        />
        {/* inner ping */}
        <span
          className="absolute inset-6 rounded-full bg-purple-300 animate-ping"
          style={{ animationDuration: "2.2s", animationDelay: "1.1s", opacity: 0.3 }}
        />
        {/* center orb */}
        <span className="relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-300/40">
          {cfg.icon}
        </span>
      </div>

      {/* Bouncing dots */}
      <div className="flex items-end gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              animationDelay: `${i * 160}ms`,
              background: i === 0 ? "#a855f7" : i === 1 ? "#8b5cf6" : "#7c3aed",
            }}
          />
        ))}
      </div>

      {/* Text */}
      <div className="text-center space-y-1.5 max-w-xs">
        <p className="text-sm font-semibold text-gray-700">{message || cfg.title}</p>
        <p className="text-xs text-gray-400 leading-relaxed">{sub || cfg.sub}</p>
      </div>

      {/* Indeterminate progress bar */}
      <div className="w-48 h-1 bg-purple-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-400 via-violet-500 to-purple-400"
          style={{ animation: "synthgen-slide 1.8s ease-in-out infinite", backgroundSize: "200% 100%" }}
        />
      </div>
    </div>
  );
}
