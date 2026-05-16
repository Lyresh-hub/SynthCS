import { useState, useLayoutEffect } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  target: string | null; // CSS selector; null = centred modal
  placement?: "right" | "bottom";
  emoji: string;
}

const STEPS: TourStep[] = [
  {
    emoji: "👋",
    title: "Welcome to SynthCS!",
    description: "Generate realistic synthetic datasets in minutes. Here's a quick look at what you can do.",
    target: null,
  },
  {
    emoji: "🏗️",
    title: "Start here — Schema Builder",
    description: "Describe your dataset, search real data sources, or let AI build the schema for you. Then hit Generate.",
    target: "[data-tour='nav-schema']",
    placement: "right",
  },
  {
    emoji: "📥",
    title: "Your Downloads",
    description: "Every dataset you generate lands here. Preview it, download as CSV, or delete when done.",
    target: "[data-tour='nav-downloads']",
    placement: "right",
  },
  {
    emoji: "💾",
    title: "Saved Schemas",
    description: "Schemas you save appear here. Reload them anytime to generate fresh data without rebuilding.",
    target: "[data-tour='nav-saved']",
    placement: "right",
  },
  {
    emoji: "🔔",
    title: "Get notified",
    description: "Generation runs in the background. The bell lets you know the moment your dataset is ready.",
    target: "[data-tour='notif-bell']",
    placement: "bottom",
  },
  {
    emoji: "🚀",
    title: "Ready? Let's go!",
    description: "Head to Schema Builder and generate your first dataset. You can replay this tour from the sidebar anytime.",
    target: null,
  },
];

const PAD = 10; // padding around spotlight target
const TIP_W = 320; // tooltip width in px

/** Find first element matching selector that is actually on-screen (not in hidden mobile drawer). */
function findVisible(selector: string): DOMRect | null {
  const els = document.querySelectorAll(selector);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.left >= 0 && r.width > 0 && r.top >= 0) return r;
  }
  return null;
}

function tooltipPos(rect: DOMRect, placement: "right" | "bottom"): React.CSSProperties {
  if (placement === "right") {
    return {
      top: Math.max(16, Math.min(window.innerHeight - 340, rect.top + rect.height / 2 - 110)),
      left: rect.right + 20,
      width: TIP_W,
    };
  }
  return {
    top: rect.bottom + 16,
    left: Math.max(16, Math.min(window.innerWidth - TIP_W - 16, rect.left + rect.width / 2 - TIP_W / 2)),
    width: TIP_W,
  };
}

interface Props {
  onDone: () => void;
}

export default function OnboardingTour({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  useLayoutEffect(() => {
    if (!current.target) { setRect(null); return; }
    const r = findVisible(current.target);
    setRect(r);
    if (r) {
      // Scroll element into view smoothly if needed
      const el = document.querySelector(current.target);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [step, current.target]);

  function next() { step < STEPS.length - 1 ? setStep((s) => s + 1) : onDone(); }
  function prev() { if (step > 0) setStep((s) => s - 1); }

  const hasSpotlight = !!current.target && !!rect;
  const placement    = current.placement ?? "right";

  const spotlightStyle: React.CSSProperties = hasSpotlight ? {
    position: "fixed",
    top:    rect!.top    - PAD,
    left:   rect!.left   - PAD,
    width:  rect!.width  + PAD * 2,
    height: rect!.height + PAD * 2,
    borderRadius: 12,
    boxShadow: "0 0 0 9999px rgba(15,10,40,0.68)",
    border: "2px solid rgba(168,85,247,0.8)",
    zIndex: 9999,
    pointerEvents: "none",
    transition: "all 0.22s ease",
  } : {};

  const tipStyle: React.CSSProperties = hasSpotlight
    ? { position: "fixed", zIndex: 10000, ...tooltipPos(rect!, placement) }
    : { position: "fixed", zIndex: 10000, top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 380 };

  return (
    <>
      {/* Full-screen backdrop for centred steps */}
      {!hasSpotlight && (
        <div className="fixed inset-0 z-[9998] bg-black/60" style={{ backdropFilter: "blur(3px)" }} />
      )}

      {/* Spotlight cutout */}
      {hasSpotlight && <div style={spotlightStyle} />}

      {/* Tooltip card */}
      <div style={tipStyle} className="tour-card-enter">
        {/* Arrow for right placement */}
        {hasSpotlight && placement === "right" && (
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white drop-shadow-sm" />
        )}
        {/* Arrow for bottom placement */}
        {hasSpotlight && placement === "bottom" && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white drop-shadow-sm" />
        )}

        <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-purple-100">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Dismiss */}
          <button
            onClick={onDone}
            className="absolute top-3 right-3 p-1 rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Body */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl leading-none flex-shrink-0">{current.emoji}</span>
              <div>
                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-widest mb-0.5">
                  Step {step + 1} of {STEPS.length}
                </p>
                <h3 className="text-sm font-bold text-gray-900">{current.title}</h3>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{current.description}</p>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-between">
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all duration-200 ${
                    i === step
                      ? "w-5 h-1.5 bg-purple-600"
                      : "w-1.5 h-1.5 bg-gray-200 hover:bg-gray-300"
                  }`}
                />
              ))}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-1.5">
              {!isFirst && (
                <button
                  onClick={prev}
                  className="flex items-center gap-0.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}
              <button
                onClick={next}
                className="flex items-center gap-1 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {isLast ? "Get Started" : "Next"}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
