import { useState, useEffect } from "react";
import { Sparkles, Search, Download, Cpu } from "lucide-react";

type LoaderPhase = "generating" | "loading" | "searching" | "augmenting";

const PHASE_CONFIG: Record<LoaderPhase, { icon: React.ReactNode; messages: string[] }> = {
  generating: {
    icon: <Sparkles className="w-5 h-5 text-white" />,
    messages: [
      "Teaching the model your schema…",
      "Synthesizing realistic patterns…",
      "Generating rows…",
      "Sprinkling some magic…",
      "Almost there…",
    ],
  },
  loading: {
    icon: <Download className="w-5 h-5 text-white" />,
    messages: [
      "Fetching your data…",
      "Processing columns…",
      "Preparing your schema…",
      "Almost ready…",
    ],
  },
  searching: {
    icon: <Search className="w-5 h-5 text-white" />,
    messages: [
      "Scanning Kaggle…",
      "Checking Hugging Face…",
      "Searching UCI & OpenML…",
      "Scouting Data.gov.ph & PSA…",
      "Gathering the best matches…",
    ],
  },
  augmenting: {
    icon: <Cpu className="w-5 h-5 text-white" />,
    messages: [
      "Downloading real data…",
      "Detecting missing fields…",
      "Merging datasets…",
      "Building your schema…",
    ],
  },
};

// Sparkle positions orbiting around the center orb
const SPARKLE_POSITIONS = [
  { top: "-18px",  left: "50%",    transform: "translateX(-50%)", animationDelay: "0s"    },
  { top: "12px",   right: "-18px",                                 animationDelay: "0.4s"  },
  { bottom: "12px",right: "-18px",                                 animationDelay: "0.8s"  },
  { bottom: "-18px",left: "50%",   transform: "translateX(-50%)", animationDelay: "1.2s"  },
  { bottom: "12px",left: "-18px",                                  animationDelay: "0.6s"  },
  { top: "12px",   left: "-18px",                                  animationDelay: "1.0s"  },
];

interface Props {
  phase?: LoaderPhase;
  message?: string;
}

export default function GeneratingLoader({ phase = "generating", message }: Props) {
  const cfg = PHASE_CONFIG[phase];
  const [msgIdx, setMsgIdx] = useState(0);

  // Cycle through phase messages every 2.2 s
  useEffect(() => {
    setMsgIdx(0);
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % cfg.messages.length), 2200);
    return () => clearInterval(id);
  }, [phase, cfg.messages.length]);

  const displayMsg = message || cfg.messages[msgIdx];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-8 py-14 shadow-sm flex flex-col items-center gap-7">

      {/* Orb + floating sparkles */}
      <div className="relative flex items-center justify-center w-28 h-28">

        {/* Floating sparkle dots */}
        {SPARKLE_POSITIONS.map((pos, i) => (
          <span
            key={i}
            className="absolute text-[10px] text-fuchsia-400 sparkle-float select-none"
            style={pos as React.CSSProperties}
          >
            ✦
          </span>
        ))}

        {/* Outer spinning halo ring */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, #e9d5ff, #c084fc, #a855f7, #7c3aed, #e9d5ff)",
            animation: "halo-spin 3s linear infinite",
            opacity: 0.35,
          }}
        />

        {/* Soft glow rings */}
        <span className="absolute inset-1 rounded-full bg-purple-100 animate-ping" style={{ animationDuration: "2.4s", opacity: 0.45 }} />
        <span className="absolute inset-4 rounded-full bg-purple-200 animate-ping" style={{ animationDuration: "2.4s", animationDelay: "0.6s", opacity: 0.35 }} />
        <span className="absolute inset-7 rounded-full bg-violet-300 animate-ping" style={{ animationDuration: "2.4s", animationDelay: "1.2s", opacity: 0.25 }} />

        {/* Center orb */}
        <span className="relative z-10 flex items-center justify-center w-12 h-12 rounded-full shadow-lg shadow-purple-400/40"
          style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed, #c026d3)" }}>
          {cfg.icon}
        </span>
      </div>

      {/* Bouncing dots — purple → violet → fuchsia gradient */}
      <div className="flex items-end gap-2.5">
        {(["#c084fc", "#8b5cf6", "#e879f9"] as const).map((color, i) => (
          <span
            key={i}
            className="block rounded-full animate-bounce"
            style={{
              width: i === 1 ? 12 : 9,
              height: i === 1 ? 12 : 9,
              background: color,
              animationDelay: `${i * 150}ms`,
              animationDuration: "0.9s",
            }}
          />
        ))}
      </div>

      {/* Cycling message */}
      <div className="text-center space-y-1.5 max-w-xs min-h-[2.5rem] flex flex-col items-center justify-center">
        <p
          key={displayMsg}
          className="text-sm font-semibold text-gray-700 loader-msg-enter"
        >
          {displayMsg}
        </p>
        <p className="text-xs text-gray-400">This may take a moment — sit tight ✨</p>
      </div>

      {/* Shimmer progress bar */}
      <div className="w-52 h-1.5 bg-purple-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #c084fc, #8b5cf6, #e879f9, #8b5cf6, #c084fc)",
            backgroundSize: "300% 100%",
            animation: "synthgen-slide 2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
