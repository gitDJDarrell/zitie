import { useEffect, useMemo, useState } from "react";
import { Chip, Rating, SpeakBtn, Switch } from "../components/atoms";
import { CardDetail } from "../components/CardDetail";
import { MysteryCardDetail } from "../components/MysteryCardDetail";
import { WORD_DEX_LEVELS, WORD_INDEX, WORD_ORDER, WORD_TOTAL } from "../data/wordDex";
import { normalizePinyin } from "../lib/pinyin";
import { useGridWindow } from "../lib/useGridWindow";
import { isCollected, proofsOf } from "../lib/srs";
import { C } from "../theme";
import type { Card, SeenMap, StudyIds } from "../types";

const TILE_MIN = 88;   // px — four columns on a phone, and a four-character idiom still fits
const TILE_HEIGHT = 62;
const GAP = 4;

type Show = "all" | "collected" | "progress" | "missing";

/* ————————————————— the word dex —————————————————
   The character dex's sibling: every word in the official HSK 3.0 vocabulary
   list is a slot, collected the same way — by having a card for it. Words are
   where the characters go once they combine, so the two catalogs are the same
   game played at two scales, and share the tracing-outline language: an
   uncollected slot shows the shape and nothing else. */
export function WordDex({ bank, srs, onToggleStar, stack, onAddToStack, onRemoveFromStack, onStudyIds }: {
  bank: Card[]; srs: SeenMap; onToggleStar: (id: string) => void;
  stack: string[]; onAddToStack: (ids: string[]) => void; onRemoveFromStack: (ids: string[]) => void;
  onStudyIds: StudyIds;
}) {
  const [levelId, setLevelId] = useState<string>(WORD_DEX_LEVELS[0].id);
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const stackSet = useMemo(() => new Set(stack), [stack]);

  const byHanzi = useMemo(() => new Map(bank.map(c => [c.hanzi, c])), [bank]);

  // Same rule as the character dex: a slot is earned by proving the word in
  // both directions, not by having imported a card for it.
  const earned = (w: string) => isCollected(srs[byHanzi.get(w)?.id ?? ""]);
  const held = (w: string) => byHanzi.has(w) && !earned(w);

  const collectedTotal = useMemo(
    () => [...WORD_INDEX.keys()].filter(earned).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byHanzi, srs],
  );
  const heldTotal = useMemo(
    () => [...WORD_INDEX.keys()].filter(held).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byHanzi, srs],
  );

  const level = WORD_DEX_LEVELS.find(l => l.id === levelId) ?? WORD_DEX_LEVELS[0];
  const levelCollected = useMemo(
    () => level.words.filter(earned).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, byHanzi, srs],
  );

  // Search matches the written form always, and the reading for words already
  // collected — an uncollected slot's reading is exactly what the dex is
  // withholding, so it can't be searchable.
  const visible = useMemo(() => {
    const q = query.trim();
    const letters = q ? normalizePinyin(q).letters : "";
    return level.words.filter(word => {
      const card = byHanzi.get(word);
      if (show === "collected" && !earned(word)) return false;
      if (show === "progress" && !held(word)) return false;
      if (show === "missing" && byHanzi.has(word)) return false;
      if (!q) return true;
      if (word.includes(q)) return true;
      return !!card && earned(word) && !!letters && normalizePinyin(card.pinyin).letters.includes(letters);
    });
  }, [level, byHanzi, show, query]);

  const { ref, columns, rowCount, firstRow, lastRow } =
    useGridWindow(visible.length, { tileMin: TILE_MIN, tileHeight: TILE_HEIGHT, gap: GAP });
  const start = firstRow * columns;
  const end = Math.min(visible.length, (lastRow + 1) * columns);
  const rendered = visible.slice(start, end);

  // Changing level or filter shortens the grid under you. Scrolled deep into
  // HSK 7-9's 5,602 slots, switching to HSK 1's 505 would otherwise leave the
  // page parked past the end of the new grid, looking empty.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo({ top: top - 8 });
  }, [levelId, show, query, ref]);

  // Study exactly what's on screen: with no filter that's the level's
  // collected words, and with a search or the "collected" filter it's that
  // narrower set — studying what you're looking at is the least surprising
  // reading of the button.
  const studyable = useMemo(
    // In-progress first — the button's job is to finish what you started.
    () => [...visible.filter(held), ...visible.filter(earned)]
      .map(w => byHanzi.get(w)?.id).filter((id): id is string => !!id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, byHanzi, srs],
  );
  const studyableHeld = useMemo(
    () => visible.filter(held).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, byHanzi, srs],
  );

  const openWord = (word: string) => {
    const index = WORD_ORDER.indexOf(word);
    if (index !== -1) setCursor(index);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="hz text-base" style={{ color: C.dim }}>词鉴</span>
          <span className="ui t-label" style={{ color: C.faint }}>word dex</span>
        </div>
        <div className="ui text-xs text-right" style={{ color: C.dim }}>
          <div>
            <span style={{ color: C.paper }}>{collectedTotal}</span>
            <span style={{ color: C.faint }}> / {WORD_TOTAL} collected</span>
          </div>
          {heldTotal > 0 && (
            <div className="ui t-micro" style={{ color: C.faint }}>{heldTotal} in progress</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {WORD_DEX_LEVELS.map(l => (
          <Chip key={l.id} active={levelId === l.id} onClick={() => setLevelId(l.id)}>
            {l.label}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: C.ink3 }} aria-hidden="true">
          <div className="h-full rounded-full"
            style={{
              width: `${level.words.length ? Math.round((levelCollected / level.words.length) * 100) : 0}%`,
              background: C.paper, transition: "width 300ms ease",
            }} />
        </div>
        <div className="ui text-xs shrink-0" style={{ color: C.faint }}>
          <span style={{ color: C.paper }}>{levelCollected}</span> / {level.words.length}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search this level"
          aria-label={`Search ${level.label} words`}
          className="ui flex-1 min-w-[8rem] px-3 py-2 rounded"
          style={{ background: C.ink2, border: `1px solid ${C.ink3}`, color: C.paper }} />
        <Switch value={show} options={[
          { value: "all", label: "all" },
          { value: "collected", label: "collected" },
          { value: "progress", label: "in progress" },
          { value: "missing", label: "missing" },
        ]} onChange={setShow} />
      </div>

      {studyable.length > 0 && (
        <button onClick={() => onStudyIds(studyable, {
          zh: "词", label: `${level.label} — words you have`,
          noun: "in your bank", emptyText: "No words from this level are in your bank yet.",
        })}
          className="ui self-start px-4 py-2 t-btn border rounded"
          style={{ borderColor: C.line, color: C.paper }}>
          {studyableHeld > 0
            ? <>学 earn these {studyableHeld}</>
            : <>学 study these {studyable.length}</>}
        </button>
      )}

      {visible.length === 0 ? (
        <p className="ui t-body py-8 text-center" style={{ color: C.faint }}>
          {query.trim()
            ? <>Nothing in {level.label} matches “{query.trim()}”.</>
            : show === "collected"
              ? <>Nothing earned in {level.label} yet — study a word both ways to collect it.</>
              : show === "progress"
                ? <>Nothing part-way in {level.label}. Import a page with some, or pick a level you're working through.</>
                : <>Every word in {level.label} is in your bank. 全部收集.</>}
        </p>
      ) : (
        <div ref={ref} className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {/* Reserve the height of the rows above and below, so the scrollbar
              matches the whole catalog while the DOM holds only what's near. */}
          {firstRow > 0 && (
            <div aria-hidden="true" style={{ gridColumn: "1 / -1", height: firstRow * (TILE_HEIGHT + GAP) }} />
          )}

          {rendered.map(word => {
            const card = byHanzi.get(word);
            const slot = WORD_INDEX.get(word);
            const n = slot?.n ?? 0;
            const proofs = card ? proofsOf(srs[card.id]) : { read: false, write: false };
            return card && proofs.read && proofs.write ? (
              // Speak button as a sibling, not a child — a button inside a
              // button is invalid and Safari drops the inner one's clicks.
              <div key={word} className="relative" style={{ height: TILE_HEIGHT }}>
                <button onClick={() => openWord(word)}
                  aria-label={`No. ${n} ${word} — collected, view details`}
                  className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1 rounded"
                  style={{ background: C.ink2, border: `1px solid ${C.ink3}` }}>
                  <span className="hz leading-tight truncate w-full text-center"
                    style={{ color: C.paper, fontSize: word.length > 3 ? 15 : 19 }}>{word}</span>
                  <span className="mono t-micro truncate w-full text-center" style={{ color: C.faint }}>
                    {card.pinyin}
                  </span>
                  <span style={{ color: C.dim }}><Rating rec={srs[card.id]} compact /></span>
                </button>
                <SpeakBtn text={word} className="absolute top-0 right-0 !px-1 !py-0.5"
                  style={{ fontSize: 10, color: C.faint }} />
              </div>
            ) : card ? (
              // In your bank, not yet earned: the word is shown, the slot is
              // not, and the two glyphs say which half is still owed. No
              // speaker — the reading is the reward for the read half.
              <button key={word} onClick={() => openWord(word)}
                aria-label={`No. ${n} ${word} — in your bank, ${
                  proofs.read ? "recognised" : "not yet recognised"}, ${
                  proofs.write ? "written" : "not yet written"}. Tap to view.`}
                className="flex flex-col items-center justify-center gap-0.5 px-1 rounded"
                style={{ height: TILE_HEIGHT, border: `1px dashed ${C.line}` }}>
                <span className="hz leading-tight truncate w-full text-center"
                  style={{ color: C.dim, fontSize: word.length > 3 ? 15 : 19 }}>{word}</span>
                <span className="ui t-micro" style={{ color: C.faint }}>{String(n).padStart(5, "0")}</span>
                <span className="ui t-micro" aria-hidden="true">
                  <span style={{ color: proofs.read ? C.paper : C.ink3 }}>认</span>
                  <span style={{ color: proofs.write ? C.paper : C.ink3 }}>写</span>
                </span>
              </button>
            ) : (
              // No speaker and no reading: hearing an uncollected word would
              // give away exactly what the slot is holding back.
              <button key={word} onClick={() => openWord(word)}
                aria-label={`No. ${n} — not yet collected, tap to view`}
                className="flex flex-col items-center justify-center gap-0.5 px-1 rounded"
                style={{ height: TILE_HEIGHT, border: `1px dashed ${C.ink3}` }}>
                <span className="hz leading-tight truncate w-full text-center" aria-hidden="true"
                  style={{
                    color: "transparent", WebkitTextStroke: `1px ${C.line}`,
                    fontSize: word.length > 3 ? 15 : 19,
                  }}>{word}</span>
                <span className="ui t-micro" style={{ color: C.faint }}>{String(n).padStart(5, "0")}</span>
              </button>
            );
          })}

          {lastRow < rowCount - 1 && (
            <div aria-hidden="true"
              style={{ gridColumn: "1 / -1", height: (rowCount - 1 - lastRow) * (TILE_HEIGHT + GAP) }} />
          )}
        </div>
      )}

      {cursor !== null && (() => {
        const word = WORD_ORDER[cursor];
        if (!word) return null;
        const card = byHanzi.get(word);
        const goPrev = cursor > 0 ? () => setCursor(cursor - 1) : undefined;
        const goNext = cursor < WORD_ORDER.length - 1 ? () => setCursor(cursor + 1) : undefined;
        if (card) {
          return (
            <CardDetail card={card} srs={srs} onClose={() => setCursor(null)} onToggleStar={onToggleStar}
              inStack={stackSet.has(card.id)}
              onToggleStack={() => stackSet.has(card.id) ? onRemoveFromStack([card.id]) : onAddToStack([card.id])}
              onPrev={goPrev} onNext={goNext} />
          );
        }
        const slot = WORD_INDEX.get(word);
        const levelLabel = WORD_DEX_LEVELS.find(l => l.id === slot?.levelId)?.label ?? "";
        return (
          <MysteryCardDetail kind="word" hanzi={word} dexNumber={slot?.n ?? cursor + 1} levelLabel={levelLabel}
            onClose={() => setCursor(null)} onPrev={goPrev} onNext={goNext} />
        );
      })()}
    </div>
  );
}
