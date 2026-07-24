import { useEffect, useState } from "react";
import { api, type CharacterInsight, type InsightComponent } from "../api/client";
import { DAY } from "../lib/filters";
import { DEX_LEVELS, DEX_INDEX } from "../data/dex";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

const ROLE_LABEL: Record<InsightComponent["role"], string> = {
  semantic: "meaning", phonetic: "sound", meaning: "meaning", form: "form",
};

// Full-entry view, opened from a gallery slot or a browse row. onPrev/onNext
// are only wired up by the gallery dex grid, so it can page through the
// catalog like an index without closing and reopening the modal.
export function CardDetail({ card, srs, onClose, onToggleStar, inStack, onToggleStack, onPrev, onNext }: {
  card: Card; srs: SeenMap; onClose: () => void; onToggleStar: (id: string) => void;
  inStack: boolean; onToggleStack: () => void;
  onPrev?: () => void; onNext?: () => void;
}) {
  const rec = srs[card.id];
  const ago = rec ? Math.floor((Date.now() - rec.last) / DAY) : null;
  const slot = DEX_INDEX.get(card.hanzi);
  const level = slot ? DEX_LEVELS.find(l => l.id === slot.levelId) : undefined;

  // Deep breakdown is shared/cached server-side and fetched lazily on open.
  const [insight, setInsight] = useState<CharacterInsight | null>(null);
  const [insightState, setInsightState] = useState<"loading" | "ready" | "none">("loading");
  useEffect(() => {
    let live = true;
    setInsightState("loading"); setInsight(null);
    api.getInsights([card.hanzi]).then(({ insights }) => {
      if (!live) return;
      const found = insights[card.hanzi];
      setInsight(found ?? null);
      setInsightState(found ? "ready" : "none");
    }).catch(() => { if (live) setInsightState("none"); });
    return () => { live = false; };
  }, [card.hanzi]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-lg sm:rounded-lg p-6 flex flex-col gap-4"
        style={{ background: C.ink, border: `1px solid ${C.line}` }}>

        <div className="flex items-start justify-between">
          <div className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>
            {slot
              ? <>图鉴 No. {String(slot.n).padStart(4, "0")} · {level?.label}</>
              : card.compound ? "compound · beyond the dex" : "beyond the dex"}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onToggleStack}
              aria-label={inStack ? `Remove ${card.hanzi} from stack` : `Add ${card.hanzi} to stack`}
              className="px-2 py-1 text-xl leading-none"
              style={{ color: inStack ? C.paper : C.faint }}>
              {inStack ? "▤" : "▢"}
            </button>
            <button onClick={() => onToggleStar(card.id)}
              aria-label={card.starred ? "Unstar" : "Mark as tricky"}
              className="px-2 py-1 text-xl leading-none"
              style={{ color: card.starred ? C.cinnabar : C.faint }}>
              {card.starred ? "★" : "☆"}
            </button>
            <button onClick={onClose} aria-label="Close"
              className="ui px-2 py-1 text-base leading-none" style={{ color: C.faint }}>✕</button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="hz font-black" style={{ color: C.paper, fontSize: card.hanzi.length > 2 ? 64 : 96, lineHeight: 1.1 }}>
            {card.hanzi}
          </div>
          <div className="mono text-2xl" style={{ color: C.paper }}>{card.pinyin}</div>
          <div className="ui text-base text-center leading-relaxed" style={{ color: C.paper }}>{card.meaning}</div>
          <div className="ui text-xs" style={{ color: C.faint }}>
            {card.pos.join(" · ")}{card.compound ? " · compound" : ""}
            {(card.radical || card.strokes) && (
              <> — {card.radical ? `radical ${card.radical}` : ""}{card.radical && card.strokes ? " · " : ""}{card.strokes ? `${card.strokes} strokes` : ""}</>
            )}
          </div>
        </div>

        {/* ——— deep breakdown ——— */}
        {insightState === "loading" && (
          <div className="ui text-xs text-center py-2" style={{ color: C.faint }}>decoding character…</div>
        )}
        {insightState === "ready" && insight && (
          <div className="flex flex-col gap-3 pt-3" style={{ borderTop: `1px solid ${C.ink3}` }}>
            <div className="flex items-baseline gap-2">
              <span className="hz text-sm" style={{ color: C.dim }}>解</span>
              <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>breakdown</span>
              {insight.structure && <span className="ui text-xs" style={{ color: C.faint }}>· {insight.structure}</span>}
            </div>

            {insight.components.length > 0 && (
              <div className="flex flex-col gap-2">
                {insight.components.map((comp, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="hz text-2xl leading-none shrink-0 w-8 text-center" style={{ color: C.paper }}>{comp.char}</div>
                    <div className="flex-1 min-w-0">
                      <div className="ui text-xs" style={{ color: C.dim }}>
                        {comp.reading && <span className="mono">{comp.reading}</span>}
                        {comp.gloss && <span> · {comp.gloss}</span>}
                        <span className="ui" style={{ color: C.faint }}> · {ROLE_LABEL[comp.role]}</span>
                      </div>
                      {comp.note && <div className="ui text-xs leading-relaxed" style={{ color: C.faint }}>{comp.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insight.story && (
              <div className="ui text-xs leading-relaxed" style={{ color: C.dim }}>{insight.story}</div>
            )}

            {insight.compounds.length > 0 && (
              <div className="flex flex-col gap-1 pt-2" style={{ borderTop: `1px solid ${C.ink3}` }}>
                <div className="ui text-xs uppercase tracking-widest mb-1" style={{ color: C.faint }}>appears in</div>
                {insight.compounds.map((w, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="hz text-base" style={{ color: C.paper }}>{w.zh}</span>
                    {w.py && <span className="mono text-xs" style={{ color: C.dim }}>{w.py}</span>}
                    {w.en && <span className="ui text-xs" style={{ color: C.faint }}>{w.en}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {card.examples && card.examples.length > 0 && (
          <div className="flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${C.ink3}` }}>
            {card.examples.map((ex, i) => (
              <div key={i} className="text-center">
                <span className="hz text-base" style={{ color: C.paper }}>{ex.zh}</span>
                {ex.py && <span className="mono text-xs" style={{ color: C.dim }}>{" "}{ex.py}</span>}
                {ex.en && <div className="ui text-xs" style={{ color: C.dim }}>{ex.en}</div>}
              </div>
            ))}
          </div>
        )}

        {card.notes && (
          <div className="ui text-xs text-center leading-relaxed italic" style={{ color: C.faint }}>{card.notes}</div>
        )}

        <div className="ui text-xs text-center pt-3" style={{ color: C.faint, borderTop: `1px solid ${C.ink3}` }}>
          {rec
            ? <>studied {rec.views} time{rec.views === 1 ? "" : "s"} · {ago === 0 ? "seen today" : `last seen ${ago}d ago`}</>
            : "not studied yet"}
          {" · "}collected {card.added}
        </div>

        {(onPrev || onNext) && (
          <div className="flex justify-between items-center pt-1">
            <button onClick={onPrev} disabled={!onPrev} aria-label="Previous character"
              className="ui px-4 py-2 text-xs uppercase tracking-widest border rounded"
              style={{ borderColor: C.line, color: onPrev ? C.dim : C.faint, opacity: onPrev ? 1 : 0.35 }}>
              {"←"} prev
            </button>
            <button onClick={onNext} disabled={!onNext} aria-label="Next character"
              className="ui px-4 py-2 text-xs uppercase tracking-widest border rounded"
              style={{ borderColor: C.line, color: onNext ? C.dim : C.faint, opacity: onNext ? 1 : 0.35 }}>
              next {"→"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
