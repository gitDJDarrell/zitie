import { C } from "../theme";

// Placeholder detail view for a dex slot that hasn't been collected yet —
// serves both catalogs. Only the shape (silhouette) and catalog position are
// known; reading, meaning, and breakdown stay hidden to preserve the incentive
// to collect it.
export function MysteryCardDetail({ hanzi, dexNumber, levelLabel, kind = "character", onClose, onPrev, onNext }: {
  hanzi: string; dexNumber: number; levelLabel: string;
  kind?: "character" | "word";
  onClose: () => void; onPrev?: () => void; onNext?: () => void;
}) {
  const word = kind === "word";
  const catalog = word ? "词鉴" : "图鉴";
  const digits = word ? 5 : 4; // the word dex runs past 10,000 slots
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-t-lg sm:rounded-lg p-6 flex flex-col gap-4"
        style={{ background: C.ink, border: `1px solid ${C.line}` }}>

        <div className="flex items-start justify-between">
          <div className="ui t-label" style={{ color: C.faint }}>
            {catalog} No. {String(dexNumber).padStart(digits, "0")} · {levelLabel}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="ui px-2 py-1 text-base leading-none" style={{ color: C.faint }}>✕</button>
        </div>

        <div className="flex flex-col items-center gap-2 py-4">
          <div className="hz font-black" aria-hidden="true"
            style={{
              color: "transparent", WebkitTextStroke: `2px ${C.line}`,
              fontSize: hanzi.length > 2 ? 60 : 96, lineHeight: 1.1,
            }}>
            {hanzi}
          </div>
          <div className="mono text-2xl" style={{ color: C.faint }}>???</div>
          <p className="ui text-xs text-center leading-relaxed max-w-xs pt-2" style={{ color: C.dim }}>
            Not yet collected. Its shape is visible in the dex — import a page that contains
            {word ? " this word" : " it"} to reveal the reading, meaning, and story.
          </p>
        </div>

        {(onPrev || onNext) && (
          <div className="flex justify-between items-center pt-3" style={{ borderTop: `1px solid ${C.ink3}` }}>
            <button onClick={onPrev} disabled={!onPrev} aria-label={`Previous ${kind}`}
              className="ui px-4 py-2 t-btn border rounded"
              style={{ borderColor: C.line, color: onPrev ? C.dim : C.faint, opacity: onPrev ? 1 : 0.35 }}>
              {"←"} prev
            </button>
            <button onClick={onNext} disabled={!onNext} aria-label={`Next ${kind}`}
              className="ui px-4 py-2 t-btn border rounded"
              style={{ borderColor: C.line, color: onNext ? C.dim : C.faint, opacity: onNext ? 1 : 0.35 }}>
              next {"→"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
