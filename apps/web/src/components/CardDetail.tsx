import { DAY } from "../lib/filters";
import { DEX_BANDS, DEX_INDEX } from "../data/dex";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

// Full-entry view, opened from a gallery slot or a browse row.
export function CardDetail({ card, srs, onClose, onToggleStar }: {
  card: Card; srs: SeenMap; onClose: () => void; onToggleStar: (id: string) => void;
}) {
  const rec = srs[card.id];
  const ago = rec ? Math.floor((Date.now() - rec.last) / DAY) : null;
  const slot = DEX_INDEX.get(card.hanzi);
  const band = slot ? DEX_BANDS.find(b => b.id === slot.bandId) : undefined;

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
              ? <>图鉴 No. {String(slot.n).padStart(4, "0")} · {band?.label}</>
              : card.compound ? "compound · beyond the dex" : "beyond the dex"}
          </div>
          <div className="flex items-center gap-1">
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
      </div>
    </div>
  );
}
