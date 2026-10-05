import { useState } from "react";

// Long text (e.g. a pasted prompt) is shown as a few lines with "Show full prompt",
// so one very long entry can't stretch a whole page — especially on phones.
export const CLAMP_CHARS = 280;

export default function ClampedText({ text, className = "", label = "prompt" }: { text: string; className?: string; label?: string }) {
  const [full, setFull] = useState(false);
  const long = (text ?? "").length > CLAMP_CHARS;
  return (
    <div className={className}>
      <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${long && !full ? "line-clamp-4" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setFull((v) => !v)} className="mt-1 text-[11px] font-medium text-purple-600 hover:underline">
          {full ? `Show less` : `Show full ${label} (${text.length.toLocaleString()} characters)`}
        </button>
      )}
    </div>
  );
}
