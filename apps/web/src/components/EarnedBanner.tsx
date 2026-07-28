import { useEffect, useState } from "react";
import { DEX_INDEX, DEX_LEVELS } from "../data/dex";
import { WORD_DEX_LEVELS, WORD_INDEX } from "../data/wordDex";
import { C } from "../theme";
import type { Card } from "../types";

/* ————————————————— the reward ————————————————
   A dex slot used to fill itself the moment a card existed, which meant a
   pasted paragraph filled a hundred of them at once and none of them meant
   anything. Now a slot is earned — recognised once, written once — and this is
   the moment it lands: the character, its catalog number, and the fact that it
   has just gone into the dex.

   Deliberately a banner rather than a modal. It arrives mid-session, and a
   dialog you have to dismiss to carry on studying would turn a reward into an
   interruption. */

const SHOW_MS = 4200;

/** Where this character sits in either catalog, if it is in one at all. */
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

export function EarnedBanner({ card, onDismiss }: { card: Card; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);

  // Auto-dismisses, but the timer restarts per character: two cards earned in
  // quick succession should each get their own moment, not share one.
  useEffect(() => {
    setLeaving(false);
    const out = setTimeout(() => setLeaving(true), SHOW_MS - 300);
    const gone = setTimeout(onDismiss, SHOW_MS);
    return () => { clearTimeout(out); clearTimeout(gone); };
  }, [card.id, onDismiss]);

  const slot = slotOf(card.hanzi);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 300ms ease, transform 300ms ease",
      }}>
      <button
        onClick={onDismiss}
        className="pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 flex items-center gap-3 text-left"
        style={{ background: C.ink2, border: `1px solid ${C.paper}`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
        <span className="hz font-black leading-none shrink-0"
          style={{ color: C.paper, fontSize: card.hanzi.length > 2 ? 28 : 38 }}>
          {card.hanzi}
        </span>
        <span className="flex flex-col min-w-0">
          <span className="ui t-label" style={{ color: C.paper }}>
            收 collected
          </span>
          <span className="ui t-micro truncate" style={{ color: C.dim }}>
            {slot
              ? <>{slot.catalog} No. {String(slot.n).padStart(slot.digits, "0")} · {slot.level}</>
              : <>added to your collection</>}
          </span>
          <span className="ui t-micro truncate" style={{ color: C.faint }}>
            {card.pinyin} · {card.meaning}
          </span>
        </span>
      </button>
    </div>
  );
}
