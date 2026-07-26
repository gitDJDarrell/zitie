import { useMemo, useState } from "react";
import { Chip, Rating, SpeakBtn } from "../components/atoms";
import { CardDetail } from "../components/CardDetail";
import { MysteryCardDetail } from "../components/MysteryCardDetail";
import { DEX_LEVELS, DEX_INDEX, DEX_ORDER, DEX_TOTAL } from "../data/dex";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

// What's currently open in the detail modal: a position in the global dex
// order (collected or not — mystery slots are viewable too), or a position
// in the "beyond the dex" extras list. Either way it's an index, not a Card,
// so prev/next can page seamlessly through uncollected slots as well.
type Cursor = { kind: "dex"; index: number } | { kind: "extra"; index: number };

// A card is "fully completed" — and gets the shiny/chrome dex tile — once
// its entry is filled in beyond the AI-extracted basics: radical, strokes,
// at least one example, and notes.
function isFullyComplete(card: Card): boolean {
  return !!card.radical && card.strokes != null
    && !!card.examples?.length && !!card.notes?.trim();
}

/* ————————————————— gallery: the character dex —————————————————
   Every HSK character is a slot. Uncaught characters render as faint tracing
   outlines — like the grey template glyphs in a paper copybook — and turn to
   full ink once a matching card exists in the bank. Levels are the official
   HSK 3.0 character-list levels (7-9 combined the same way the standard
   itself combines them). Dex numbers are a stable catalog index, not a
   difficulty or frequency rank — same as a Pokédex number. */
export function GalleryView({ bank, srs, onToggleStar, stack, onAddToStack, onRemoveFromStack }: {
  bank: Card[]; srs: SeenMap; onToggleStar: (id: string) => void;
  stack: string[]; onAddToStack: (ids: string[]) => void; onRemoveFromStack: (ids: string[]) => void;
}) {
  const [levelId, setLevelId] = useState<string>(DEX_LEVELS[0].id);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const stackSet = useMemo(() => new Set(stack), [stack]);

  const byHanzi = useMemo(() => new Map(bank.map(c => [c.hanzi, c])), [bank]);
  const caughtTotal = useMemo(
    () => [...DEX_INDEX.keys()].filter(ch => byHanzi.has(ch)).length,
    [byHanzi],
  );

  const extras = useMemo(
    () => bank.filter(c => !DEX_INDEX.has(c.hanzi)),
    [bank],
  );

  const level = DEX_LEVELS.find(l => l.id === levelId);
  const levelChars = level ? [...level.chars] : [];
  const levelCaught = levelChars.filter(ch => byHanzi.has(ch)).length;
  const showing = levelId === "extras" ? null : level;

  // dex numbers are global across levels — precompute this level's starting offset
  const levelOffset = useMemo(() => {
    let n = 0;
    for (const l of DEX_LEVELS) {
      if (l.id === levelId) break;
      n += [...l.chars].length;
    }
    return n;
  }, [levelId]);


  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="hz text-base" style={{ color: C.dim }}>图鉴</span>
          <span className="ui t-label" style={{ color: C.faint }}>character dex</span>
        </div>
        <div className="ui text-xs" style={{ color: C.dim }}>
          <span style={{ color: C.paper }}>{caughtTotal}</span>
          <span style={{ color: C.faint }}> / {DEX_TOTAL} collected</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DEX_LEVELS.map(l => (
          <Chip key={l.id} active={levelId === l.id} onClick={() => setLevelId(l.id)}>
            {l.label}
          </Chip>
        ))}
        {extras.length > 0 && (
          <Chip active={levelId === "extras"} onClick={() => setLevelId("extras")}>
            beyond ({extras.length})
          </Chip>
        )}
      </div>

      {showing && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: C.ink3 }} aria-hidden="true">
              <div className="h-full rounded-full"
                style={{ width: `${levelChars.length ? Math.round((levelCaught / levelChars.length) * 100) : 0}%`, background: C.paper, transition: "width 300ms ease" }} />
            </div>
            <div className="ui text-xs shrink-0" style={{ color: C.faint }}>
              <span style={{ color: C.paper }}>{levelCaught}</span> / {levelChars.length}
            </div>
          </div>

          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
            {levelChars.map((ch, i) => {
              const card = byHanzi.get(ch);
              const n = levelOffset + i + 1;
              const dexIndex = n - 1; // DEX_ORDER is 0-based; slot.n is 1-based
              const shiny = card ? isFullyComplete(card) : false;
              return card ? (
                // The speak button has to be a sibling of the tile button, not
                // a child — a <button> inside a <button> is invalid and Safari
                // drops the inner one's clicks.
                <div key={ch} className="relative">
                  <button onClick={() => setCursor({ kind: "dex", index: dexIndex })}
                    aria-label={`No. ${n} ${ch} — collected${shiny ? ", fully completed" : ""}, view details`}
                    className={`w-full flex flex-col items-center gap-0.5 py-2 rounded${shiny ? " dex-shiny" : ""}`}
                    style={shiny ? undefined : { background: C.ink2, border: `1px solid ${C.ink3}` }}>
                    <span className="hz text-2xl leading-tight" style={{ color: shiny ? "#1a1a1a" : C.paper }}>{ch}</span>
                    <span className="ui t-micro" style={{ color: shiny ? "#3a3a3a" : C.faint }}>
                      {String(n).padStart(4, "0")}{card.starred ? " ★" : ""}
                    </span>
                    <span style={{ color: shiny ? "#3a3a3a" : C.dim }}>
                      <Rating rec={srs[card.id]} compact />
                    </span>
                  </button>
                  <SpeakBtn text={ch} className="absolute top-0 right-0 !px-1 !py-0.5"
                    style={{ fontSize: 10, color: shiny ? "#3a3a3a" : C.faint }} />
                </div>
              ) : (
                // No speak button here on purpose: hearing an uncollected
                // character would give away the reading the dex is holding back.
                <button key={ch} onClick={() => setCursor({ kind: "dex", index: dexIndex })}
                  aria-label={`No. ${n} — not yet collected, tap to view`}
                  className="flex flex-col items-center py-2 rounded"
                  style={{ border: `1px dashed ${C.ink3}` }}>
                  <span className="hz text-2xl leading-tight" aria-hidden="true"
                    style={{ color: "transparent", WebkitTextStroke: `1px ${C.line}` }}>{ch}</span>
                  <span className="ui t-micro" style={{ color: C.faint }}>{String(n).padStart(4, "0")}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {levelId === "extras" && (
        <>
          <p className="ui t-body" style={{ color: C.faint }}>
            Collected entries beyond the HSK character dex — compound words and rarer characters.
          </p>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
            {extras.map((card, i) => {
              const shiny = isFullyComplete(card);
              return (
                <div key={card.id} className="relative">
                  <button onClick={() => setCursor({ kind: "extra", index: i })}
                    aria-label={`${card.hanzi} — view details${shiny ? " (fully completed)" : ""}`}
                    className={`w-full flex flex-col items-center gap-0.5 py-2 px-1 rounded${shiny ? " dex-shiny" : ""}`}
                    style={shiny ? undefined : { background: C.ink2, border: `1px solid ${C.ink3}` }}>
                    <span className="hz text-xl leading-tight" style={{ color: shiny ? "#1a1a1a" : C.paper }}>{card.hanzi}</span>
                    <span className="ui t-micro truncate w-full text-center" style={{ color: shiny ? "#3a3a3a" : C.faint }}>{card.pinyin}</span>
                    <span style={{ color: shiny ? "#3a3a3a" : C.dim }}>
                      <Rating rec={srs[card.id]} compact />
                    </span>
                  </button>
                  <SpeakBtn text={card.hanzi} className="absolute top-0 right-0 !px-1 !py-0.5"
                    style={{ fontSize: 10, color: shiny ? "#3a3a3a" : C.faint }} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {cursor?.kind === "extra" && (() => {
        const card = extras[cursor.index];
        if (!card) return null;
        return (
          <CardDetail card={card} srs={srs} onClose={() => setCursor(null)} onToggleStar={onToggleStar}
            inStack={stackSet.has(card.id)}
            onToggleStack={() => stackSet.has(card.id) ? onRemoveFromStack([card.id]) : onAddToStack([card.id])}
            onPrev={cursor.index > 0 ? () => setCursor({ kind: "extra", index: cursor.index - 1 }) : undefined}
            onNext={cursor.index < extras.length - 1 ? () => setCursor({ kind: "extra", index: cursor.index + 1 }) : undefined} />
        );
      })()}

      {cursor?.kind === "dex" && (() => {
        const hanzi = DEX_ORDER[cursor.index];
        if (!hanzi) return null;
        const card = byHanzi.get(hanzi);
        const goPrev = cursor.index > 0 ? () => setCursor({ kind: "dex", index: cursor.index - 1 }) : undefined;
        const goNext = cursor.index < DEX_ORDER.length - 1 ? () => setCursor({ kind: "dex", index: cursor.index + 1 }) : undefined;
        if (card) {
          return (
            <CardDetail card={card} srs={srs} onClose={() => setCursor(null)} onToggleStar={onToggleStar}
              inStack={stackSet.has(card.id)}
              onToggleStack={() => stackSet.has(card.id) ? onRemoveFromStack([card.id]) : onAddToStack([card.id])}
              onPrev={goPrev} onNext={goNext} />
          );
        }
        const slot = DEX_INDEX.get(hanzi);
        const levelLabel = DEX_LEVELS.find(l => l.id === slot?.levelId)?.label ?? "";
        return (
          <MysteryCardDetail hanzi={hanzi} dexNumber={cursor.index + 1} levelLabel={levelLabel}
            onClose={() => setCursor(null)} onPrev={goPrev} onNext={goNext} />
        );
      })()}
    </div>
  );
}
