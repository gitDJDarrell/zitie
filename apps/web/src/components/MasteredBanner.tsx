import { useEffect, useState } from "react";
import { DEX_INDEX, DEX_LEVELS } from "../data/dex";
import { WORD_DEX_LEVELS, WORD_INDEX } from "../data/wordDex";
import { C } from "../theme";
import type { Card } from "../types";

/* ————————————————— 精通 the mastery reward ————————————————
   Collection is the first bar — produce the character, once, each of the three
   ways, with the study screen's help. Mastery is the second: the 考 exam sits a
   collected card strict and unassisted in every direction, and only when all
   three have been cleared MASTERY_MARKS times does the card turn shiny. That is
   a far rarer moment than a dex slot filling, so it gets a far louder one —
   a lit, gold-sheened card rather than the quiet ink banner collection uses. */

const SHOW_MS = 5200;

function slotOf(hanzi: string): { catalog: string; n: number; digits: number; level: string } | null {
  const char = DEX_INDEX.get(hanzi);
  if (char) {
    return {
      catalog: "字鉴", n: char.n, digits: 4,
      level: DEX_LEVELS.find(l => l.id === char.levelId)?.label ?? "",
    };
  }
  const word = WORD_INDEX.get(hanzi);
  if (word) {
    return {
      catalog: "词鉴", n: word.n, digits: 5,
      level: WORD_DEX_LEVELS.find(l => l.id === word.levelId)?.label ?? "",
    };
  }
  return null;
}

export function MasteredBanner({ card, onDismiss }: { card: Card; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
    const out = setTimeout(() => setLeaving(true), SHOW_MS - 400);
    const gone = setTimeout(onDismiss, SHOW_MS);
    return () => { clearTimeout(out); clearTimeout(gone); };
  }, [card.id, onDismiss]);

  const slot = slotOf(card.hanzi);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none"
      style={{
        // A full dim over the app, so the mastered card is the only lit thing —
        // collection is a passing banner, mastery stops the room.
        background: leaving ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)",
        opacity: leaving ? 0 : 1,
        transition: "opacity 400ms ease, background 400ms ease",
      }}>
      <button
        onClick={onDismiss}
        className="pointer-events-auto w-full max-w-xs rounded-xl px-6 py-7 flex flex-col items-center gap-3 text-center dex-shiny"
        style={{
          transform: leaving ? "scale(0.96)" : "scale(1)",
          transition: "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
        <span className="ui t-label" style={{ color: "#3a3a3a", letterSpacing: "0.2em" }}>
          精通 mastered
        </span>
        <span className="hz font-black leading-none"
          style={{ color: "#1a1a1a", fontSize: card.hanzi.length > 2 ? 56 : 76 }}>
          {card.hanzi}
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <span className="mono text-base" style={{ color: "#1a1a1a" }}>{card.pinyin}</span>
          <span className="ui text-sm" style={{ color: "#3a3a3a" }}>{card.meaning}</span>
        </span>
        <span className="ui t-micro" style={{ color: "#3a3a3a" }}>
          {slot
            ? <>{slot.catalog} No. {String(slot.n).padStart(slot.digits, "0")} · {slot.level} · shiny</>
            : <>cleared the 考 exam — this card is now shiny</>}
        </span>
      </button>
    </div>
  );
}
