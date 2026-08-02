import { useMemo, useState } from "react";
import { Chip, Rating, SpeakBtn, Switch } from "../components/atoms";
import { CardDetail } from "../components/CardDetail";
import { MysteryCardDetail } from "../components/MysteryCardDetail";
import { DEX_LEVELS, DEX_INDEX, DEX_ORDER, DEX_TOTAL } from "../data/dex";
import { canExam, isCollected, isDue, isMastered, PROOF_GLYPH, proofsOf } from "../lib/srs";
import { C } from "../theme";
import type { Card, SeenMap, StudyIds } from "../types";
import { WordDex } from "./WordDex";
import { useGridWindow } from "../lib/useGridWindow";

// Character tiles are square-ish and small — five or six to a phone row.
const TILE_MIN = 64;
// Pinned on every tile below, not just assumed: the windowing spacers reserve
// exactly this per row, and a tile that grows past it (a third line of glyphs,
// say) silently drags the scroll position off by a row every row.
const TILE_HEIGHT = 80;
const GAP = 4;

// What's currently open in the detail modal: a position in the global dex
// order (collected or not — mystery slots are viewable too), or a position
// in the "beyond the dex" extras list. Either way it's an index, not a Card,
// so prev/next can page seamlessly through uncollected slots as well.
type Cursor = { kind: "dex"; index: number } | { kind: "extra"; index: number };

/* ————————————————— gallery: the character dex —————————————————
   Every HSK character is a slot. Uncaught characters render as faint tracing
   outlines — like the grey template glyphs in a paper copybook — and turn to
   full ink once a matching card exists in the bank. Levels are the official
   HSK 3.0 character-list levels (7-9 combined the same way the standard
   itself combines them). Dex numbers are a stable catalog index, not a
   difficulty or frequency rank — same as a Pokédex number. */
export function GalleryView({ bank, srs, onToggleStar, stack, onAddToStack, onRemoveFromStack, onStudyIds, onStartExam }: {
  bank: Card[]; srs: SeenMap; onToggleStar: (id: string) => void;
  stack: string[]; onAddToStack: (ids: string[]) => void; onRemoveFromStack: (ids: string[]) => void;
  onStudyIds: StudyIds;
  /** Enter the 考 exam — the strict, unassisted mastery test. */
  onStartExam: () => void;
}) {
  // Which catalog is on screen. Characters lead: they're the smaller, more
  // finishable set, and every word in the other dex is built out of them.
  const [catalog, setCatalog] = useState<"characters" | "words">("characters");
  const [levelId, setLevelId] = useState<string>(DEX_LEVELS[0].id);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const stackSet = useMemo(() => new Set(stack), [stack]);

  const byHanzi = useMemo(() => new Map(bank.map(c => [c.hanzi, c])), [bank]);

  // A slot is filled by proving the character, not by owning a card for it —
  // otherwise pasting a paragraph fills a hundred slots you have never met.
  // `held` is the middle state: the card is in the bank, both proofs are not
  // in yet, and that is what the dex nudges you to finish.
  const earned = (ch: string) => isCollected(srs[byHanzi.get(ch)?.id ?? ""]);
  const held = (ch: string) => byHanzi.has(ch) && !earned(ch);

  const caughtTotal = useMemo(
    () => [...DEX_INDEX.keys()].filter(earned).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byHanzi, srs],
  );
  const heldTotal = useMemo(
    () => [...DEX_INDEX.keys()].filter(held).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byHanzi, srs],
  );
  // Mastered: collected, then cleared strict in all three directions of the 考
  // exam — the shiny cards. And how many are due to sit the exam right now, so
  // the entry can say whether there's anything to do.
  const masteredTotal = useMemo(
    () => [...DEX_INDEX.keys()].filter(ch => isMastered(srs[byHanzi.get(ch)?.id ?? ""])).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byHanzi, srs],
  );
  const examReady = useMemo(
    () => bank.filter(c => canExam(srs[c.id]) && isDue(srs[c.id])).length,
    [bank, srs],
  );

  const extras = useMemo(
    () => bank.filter(c => !DEX_INDEX.has(c.hanzi)),
    [bank],
  );

  const level = DEX_LEVELS.find(l => l.id === levelId);
  const levelChars = useMemo(() => (level ? [...level.chars] : []), [level]);
  const levelCaught = levelChars.filter(earned).length;
  const levelHeld = levelChars.filter(held).length;
  // In-progress first: the point of the button is to finish what you started.
  const levelStudyIds = [...levelChars.filter(held), ...levelChars.filter(earned)]
    .map(ch => byHanzi.get(ch)?.id).filter((id): id is string => !!id);
  const showing = levelId === "extras" ? null : level;

  const { ref: gridRef, columns, rowCount, firstRow, lastRow } =
    useGridWindow(levelChars.length, { tileMin: TILE_MIN, tileHeight: TILE_HEIGHT, gap: GAP });

  // dex numbers are global across levels — precompute this level's starting offset
  const levelOffset = useMemo(() => {
    let n = 0;
    for (const l of DEX_LEVELS) {
      if (l.id === levelId) break;
      n += [...l.chars].length;
    }
    return n;
  }, [levelId]);


  const catalogSwitch = (
    <div className="flex justify-center">
      <Switch value={catalog} options={[
        { value: "characters", label: "字 characters" },
        { value: "words", label: "词 words" },
      ]} onChange={setCatalog} />
    </div>
  );

  if (catalog === "words") {
    return (
      <div className="flex flex-col gap-4">
        {catalogSwitch}
        <WordDex bank={bank} srs={srs} onToggleStar={onToggleStar}
          stack={stack} onAddToStack={onAddToStack} onRemoveFromStack={onRemoveFromStack}
          onStudyIds={onStudyIds} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {catalogSwitch}

      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="hz text-base" style={{ color: C.dim }}>图鉴</span>
          <span className="ui t-label" style={{ color: C.faint }}>character dex</span>
        </div>
        <div className="ui text-xs text-right" style={{ color: C.dim }}>
          <div>
            <span style={{ color: C.paper }}>{caughtTotal}</span>
            <span style={{ color: C.faint }}> / {DEX_TOTAL} collected</span>
          </div>
          {masteredTotal > 0 && (
            <div className="ui t-micro" style={{ color: C.faint }}>
              <span className="hz">精</span> {masteredTotal} mastered
            </div>
          )}
          {heldTotal > 0 && (
            <div className="ui t-micro" style={{ color: C.faint }}>{heldTotal} in progress</div>
          )}
        </div>
      </div>

      {/* The 考 exam — the strict mastery test. Always offered once anything has
          been collected, so the path to shiny is visible; the caption says
          whether there's anything due to sit right now. */}
      {caughtTotal > 0 && (
        <button onClick={onStartExam}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left"
          style={{ borderColor: examReady > 0 ? C.paper : C.line, background: C.ink2 }}>
          <span className="flex items-center gap-3">
            <span className="hz text-2xl font-black" style={{ color: examReady > 0 ? C.paper : C.dim }}>考</span>
            <span className="flex flex-col">
              <span className="ui t-label" style={{ color: C.paper }}>sit the exam</span>
              <span className="ui t-micro" style={{ color: C.faint }}>
                {examReady > 0
                  ? <><span style={{ color: C.paper }}>{examReady}</span> card{examReady === 1 ? "" : "s"} due — strict, no assistance</>
                  : <>nothing due yet — collected cards return here to be mastered</>}
              </span>
            </span>
          </span>
          <span className="ui t-btn" style={{ color: examReady > 0 ? C.paper : C.faint }}>→</span>
        </button>
      )}

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

          {levelStudyIds.length > 0 && (
            <button
              onClick={() => onStudyIds(levelStudyIds, {
                zh: "鉴", label: `${level?.label ?? "dex"} — characters you have`,
                noun: "in your bank", emptyText: "Nothing from this level is in your bank yet.",
              })}
              className="ui self-start px-4 py-2 t-btn border rounded"
              style={{ borderColor: C.line, color: C.paper }}>
              {levelHeld > 0
                ? <>学 earn these {levelHeld}</>
                : <>学 study these {levelStudyIds.length}</>}
            </button>
          )}

          <div ref={gridRef} className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {/* Same windowing as the word dex: HSK 7-9 is 1,200 slots, and
                a phone shouldn't lay all of them out to show twenty. */}
            {firstRow > 0 && (
              <div aria-hidden="true" style={{ gridColumn: "1 / -1", height: firstRow * (TILE_HEIGHT + GAP) }} />
            )}
            {levelChars.slice(firstRow * columns, (lastRow + 1) * columns).map((ch, offset) => {
              const i = firstRow * columns + offset;
              const card = byHanzi.get(ch);
              const n = levelOffset + i + 1;
              const dexIndex = n - 1; // DEX_ORDER is 0-based; slot.n is 1-based
              const shiny = card ? isMastered(srs[card.id]) : false;
              const proofs = proofsOf(card ? srs[card.id] : undefined);
              const got = card ? proofs.read && proofs.write && proofs.brush : false;
              return card && got ? (
                // The speak button has to be a sibling of the tile button, not
                // a child — a <button> inside a <button> is invalid and Safari
                // drops the inner one's clicks.
                <div key={ch} className="relative" style={{ height: TILE_HEIGHT }}>
                  <button onClick={() => setCursor({ kind: "dex", index: dexIndex })}
                    aria-label={`No. ${n} ${ch} — collected${shiny ? ", mastered" : ""}, view details`}
                    className={`w-full h-full flex flex-col items-center justify-center gap-0.5 rounded${shiny ? " dex-shiny" : ""}`}
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
              ) : card ? (
                // In your bank, not yet earned. The character is shown solid —
                // withholding it would be silly when it is sitting in Browse —
                // but the slot stays outlined and says which half is missing,
                // so the tile reads as a task rather than as a trophy.
                <button key={ch} onClick={() => setCursor({ kind: "dex", index: dexIndex })}
                  aria-label={`No. ${n} ${ch} — in your bank. ${
                    PROOF_GLYPH.map(g => (proofs[g.key] ? g.label : `not yet ${g.label}`)).join(", ")
                  }. Tap to view.`}
                  className="flex flex-col items-center justify-center gap-0.5 rounded"
                  style={{ height: TILE_HEIGHT, border: `1px dashed ${C.line}` }}>
                  <span className="hz text-2xl leading-tight" style={{ color: C.dim }}>{ch}</span>
                  <span className="ui t-micro" style={{ color: C.faint }}>{String(n).padStart(4, "0")}</span>
                  <span className="hz t-micro" aria-hidden="true">
                    {PROOF_GLYPH.map(({ key, zh }) => (
                      <span key={key} style={{ color: proofs[key] ? C.paper : C.ink3 }}>{zh}</span>
                    ))}
                  </span>
                </button>
              ) : (
                // No speak button here on purpose: hearing an uncollected
                // character would give away the reading the dex is holding back.
                <button key={ch} onClick={() => setCursor({ kind: "dex", index: dexIndex })}
                  aria-label={`No. ${n} — not yet collected, tap to view`}
                  className="flex flex-col items-center justify-center gap-0.5 rounded"
                  style={{ height: TILE_HEIGHT, border: `1px dashed ${C.ink3}` }}>
                  <span className="hz text-2xl leading-tight" aria-hidden="true"
                    style={{ color: "transparent", WebkitTextStroke: `1px ${C.line}` }}>{ch}</span>
                  <span className="ui t-micro" style={{ color: C.faint }}>{String(n).padStart(4, "0")}</span>
                </button>
              );
            })}
            {lastRow < rowCount - 1 && (
              <div aria-hidden="true"
                style={{ gridColumn: "1 / -1", height: (rowCount - 1 - lastRow) * (TILE_HEIGHT + GAP) }} />
            )}
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
              const shiny = isMastered(srs[card.id]);
              return (
                <div key={card.id} className="relative">
                  <button onClick={() => setCursor({ kind: "extra", index: i })}
                    aria-label={`${card.hanzi} — view details${shiny ? " (mastered)" : ""}`}
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
