import { useMemo, useState } from "react";
import { Chip } from "../components/atoms";
import { CardDetail } from "../components/CardDetail";
import { DEX_LEVELS, DEX_INDEX, DEX_TOTAL } from "../data/dex";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

/* ————————————————— gallery: the character dex —————————————————
   Every HSK character is a slot. Uncaught characters render as faint tracing
   outlines — like the grey template glyphs in a paper copybook — and turn to
   full ink once a matching card exists in the bank. Levels are the official
   HSK 3.0 character-list levels (7-9 combined the same way the standard
   itself combines them). Dex numbers are a stable catalog index, not a
   difficulty or frequency rank — same as a Pokédex number. */
export function GalleryView({ bank, srs, onToggleStar }: {
  bank: Card[]; srs: SeenMap; onToggleStar: (id: string) => void;
}) {
  const [levelId, setLevelId] = useState<string>(DEX_LEVELS[0].id);
  const [selected, setSelected] = useState<Card | null>(null);

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

  // keep the currently-open detail in sync with bank updates (e.g. star toggle)
  const selectedLive = selected ? bank.find(c => c.id === selected.id) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="hz text-base" style={{ color: C.dim }}>图鉴</span>
          <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>character dex</span>
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

          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))" }}>
            {levelChars.map((ch, i) => {
              const card = byHanzi.get(ch);
              const n = levelOffset + i + 1;
              return card ? (
                <button key={ch} onClick={() => setSelected(card)}
                  aria-label={`No. ${n} ${ch} — collected, view details`}
                  className="flex flex-col items-center py-2 rounded"
                  style={{ background: C.ink2, border: `1px solid ${C.ink3}` }}>
                  <span className="hz text-2xl leading-tight" style={{ color: C.paper }}>{ch}</span>
                  <span className="ui" style={{ color: C.faint, fontSize: 9 }}>
                    {String(n).padStart(4, "0")}{card.starred ? " ★" : ""}
                  </span>
                </button>
              ) : (
                <div key={ch} title={`No. ${n} — not yet collected`}
                  className="flex flex-col items-center py-2 rounded"
                  style={{ border: `1px dashed ${C.ink3}` }}>
                  <span className="hz text-2xl leading-tight" aria-hidden="true"
                    style={{ color: "transparent", WebkitTextStroke: `1px ${C.line}` }}>{ch}</span>
                  <span className="ui" style={{ color: C.faint, fontSize: 9 }}>{String(n).padStart(4, "0")}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {levelId === "extras" && (
        <>
          <p className="ui text-xs leading-relaxed" style={{ color: C.faint }}>
            Collected entries beyond the HSK character dex — compound words and rarer characters.
          </p>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
            {extras.map(card => (
              <button key={card.id} onClick={() => setSelected(card)}
                aria-label={`${card.hanzi} — view details`}
                className="flex flex-col items-center py-2 px-1 rounded"
                style={{ background: C.ink2, border: `1px solid ${C.ink3}` }}>
                <span className="hz text-xl leading-tight" style={{ color: C.paper }}>{card.hanzi}</span>
                <span className="ui truncate w-full text-center" style={{ color: C.faint, fontSize: 9 }}>{card.pinyin}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedLive && (
        <CardDetail card={selectedLive} srs={srs} onClose={() => setSelected(null)} onToggleStar={onToggleStar} />
      )}
    </div>
  );
}
