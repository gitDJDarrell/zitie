import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api/client";
import { ApiStorage } from "./storage/apiStorage";
import { applyTheme, C, FONT_CSS } from "./theme";
import type { Card, SeenMap, SyncState, Theme } from "./types";

/* ————————————————— pinyin normalization ————————————————— */
const TONE_MAP: Record<string, [string, number]> = {
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  "ǖ": ["v", 1], "ǘ": ["v", 2], "ǚ": ["v", 3], "ǜ": ["v", 4],
  "ü": ["v", 0],
};

// Returns { letters: "nihao", tones: [3,3] } — tone 0/5 (neutral) stripped
function normalizePinyin(str: string) {
  let letters = "";
  const tones: number[] = [];
  for (const raw of (str || "").toLowerCase().normalize("NFC")) {
    if (TONE_MAP[raw]) {
      letters += TONE_MAP[raw][0];
      if (TONE_MAP[raw][1] > 0) tones.push(TONE_MAP[raw][1]);
    } else if (raw >= "1" && raw <= "4") {
      tones.push(Number(raw));
    } else if (raw === "5" || raw === "0") {
      // neutral tone marker — ignored
    } else if (raw >= "a" && raw <= "z") {
      letters += raw;
    }
    // spaces, apostrophes, everything else: dropped
  }
  return { letters: letters.replace(/u:/g, "v"), tones };
}

const DAY = 24 * 60 * 60 * 1000;

/* ————————————————— small UI atoms ————————————————— */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
      style={{
        borderColor: active ? C.paper : C.line,
        color: active ? C.ink : C.dim,
        background: active ? C.paper : "transparent",
      }}
    >{children}</button>
  );
}

function StarBtn({ starred, onClick }: { starred: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={starred ? "Unstar" : "Mark as tricky"}
      className="absolute top-2 right-2 px-2 py-1 text-xl"
      style={{ color: starred ? C.cinnabar : C.faint, zIndex: 1 }}>
      {starred ? "★" : "☆"}
    </button>
  );
}

function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="hz text-base" style={{ color: C.dim }}>{zh}</span>
      <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>{en}</span>
    </div>
  );
}

interface Filters {
  q: string;
  pos: string[];
  includeCompound: boolean;
  age: "all" | "new" | "old";
  starred: boolean;
}

/* ————————————— study session: read (tap-to-flip) + write (reverse, typed) ————————————— */
function StudyView({ bank, srs, filters, setFilters, posList, onSeen, onToggleStar }: {
  bank: Card[]; srs: SeenMap; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  posList: string[]; onSeen: (id: string) => void; onToggleStar: (id: string) => void;
}) {
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"read" | "write">("read");
  const [flipped, setFlipped] = useState(false);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<null | "ok" | "no">(null);
  const [score, setScore] = useState({ ok: 0, no: 0 });
  const [initialLen, setInitialLen] = useState(0);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const pool = useMemo(() => applyFilters(bank, srs, filters), [bank, srs, filters]);
  const card = queue && queue[idx] ? bank.find(c => c.id === queue[idx]) : null;
  const unseenCount = pool.filter(c => !srs[c.id]).length;

  const [wasShuffled, setWasShuffled] = useState(false);

  function begin(shuffle: boolean) {
    let q = pool.map(c => c.id);
    if (shuffle) q = [...q].sort(() => Math.random() - 0.5);
    setQueue(q); setIdx(0); setFlipped(false); setWasShuffled(shuffle);
    setInput(""); setVerdict(null); setScore({ ok: 0, no: 0 }); setInitialLen(q.length);
  }

  function quit() {
    setQueue(null); setIdx(0); setFlipped(false);
    setInput(""); setVerdict(null); setScore({ ok: 0, no: 0 });
  }

  function restart() { begin(wasShuffled); } // same order mode, fresh deck & tally

  function flip() {
    if (swipedRef.current) { swipedRef.current = false; return; } // suppress the click that follows a swipe
    if (!flipped && card) onSeen(card.id);
    setFlipped(f => !f);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
      swipedRef.current = true;
      if (dx < 0) next();
      else if (idx > 0) prev();
    }
  }

  function check() {
    if (!input.trim() || !card) return;
    const ok = input.replace(/\s+/g, "") === card.hanzi;
    setVerdict(ok ? "ok" : "no");
    setScore(s => ok ? { ...s, ok: s.ok + 1 } : { ...s, no: s.no + 1 });
    if (!ok) setQueue(q => [...(q as string[]), card.id]); // shuffle miss to end of deck
    onSeen(card.id);
  }

  function next() { setIdx(i => i + 1); setFlipped(false); setInput(""); setVerdict(null); }
  function prev() { setIdx(i => Math.max(i - 1, 0)); setFlipped(false); setInput(""); setVerdict(null); }

  if (!bank.length) return (
    <Empty zh="库空" text="No characters yet. Open Import and paste your vocabulary to begin." />
  );

  /* ——— session start ——— */
  if (!queue) return (
    <div className="flex flex-col items-center gap-6 pt-10">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="hz text-base" style={{ color: C.dim }}>课</span>
          <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>lesson</span>
        </div>
        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
          <Chip active={filters.pos.length === 0}
            onClick={() => setFilters(f => ({ ...f, pos: [] }))}>
            all
          </Chip>
          {posList.map(p => (
            <Chip key={p} active={filters.pos.includes(p)}
              onClick={() => setFilters(f => ({ ...f, pos: f.pos.includes(p) ? f.pos.filter(x => x !== p) : [...f.pos, p] }))}>
              {p}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Chip active={filters.starred}
            onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}>
            {"★"} starred only
          </Chip>
          <Chip active={filters.age === "new"}
            onClick={() => setFilters(f => ({ ...f, age: f.age === "new" ? "all" : "new" }))}>
            unseen only
          </Chip>
        </div>
      </div>
      <div className="ui text-sm" style={{ color: C.dim }}>
        <span style={{ color: C.paper }}>{pool.length}</span> cards
        {unseenCount > 0 && <> · <span style={{ color: C.paper }}>{unseenCount}</span> unseen</>}
        <span style={{ color: C.faint }}> (this lesson)</span>
      </div>
      <div className="flex gap-2">
        <Chip active={mode === "read"} onClick={() => setMode("read")}>认 read — flip cards</Chip>
        <Chip active={mode === "write"} onClick={() => setMode("write")}>写 write — type hanzi</Chip>
      </div>
      <div className="flex gap-3">
        <button onClick={() => begin(false)} disabled={!pool.length}
          className="ui px-6 py-3 text-xs tracking-widest uppercase border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: pool.length ? 1 : 0.35 }}>
          In order
        </button>
        <button onClick={() => begin(true)} disabled={!pool.length}
          className="ui px-6 py-3 text-xs tracking-widest uppercase border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: pool.length ? 1 : 0.35 }}>
          Shuffle
        </button>
      </div>
      {mode === "write" && (
        <p className="ui text-xs text-center max-w-xs leading-relaxed" style={{ color: C.faint }}>
          Write mode needs a Chinese keyboard (pinyin IME) enabled on your device.
        </p>
      )}
      {!pool.length && (
        <p className="ui text-xs" style={{ color: C.faint }}>Nothing matches the current filters.</p>
      )}
    </div>
  );

  /* ——— session complete ——— */
  if (!card) {
    const total = score.ok + score.no;
    return (
      <div className="flex flex-col items-center gap-4 pt-10">
        <div className="hz text-5xl" style={{ color: C.paper }}>毕</div>
        <p className="ui text-sm text-center" style={{ color: C.dim }}>
          {mode === "write" && total > 0
            ? <>Deck complete — ✓ {score.ok} · ✕ {score.no} · {Math.round((score.ok / total) * 100)}% accuracy</>
            : <>Deck complete — {queue.length} card{queue.length === 1 ? "" : "s"} reviewed.</>}
        </p>
        <div className="flex gap-3">
          <button onClick={() => begin(true)} className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
            style={{ borderColor: C.paper, color: C.paper }}>Again (shuffled)</button>
          <button onClick={() => setQueue(null)} className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
            style={{ borderColor: C.line, color: C.dim }}>Back</button>
        </div>
      </div>
    );
  }

  /* ——— shared header ——— */
  const inFirstPass = idx < initialLen;
  const graded = score.ok + score.no;
  const accuracy = graded ? Math.round((score.ok / graded) * 100) : null;
  const progress = mode === "write"
    ? graded / (graded + (queue.length - idx))
    : (idx + 1) / queue.length;

  const header = (
    <div className="w-full max-w-sm flex flex-col gap-2">
      <div className="flex justify-between ui text-xs tracking-widest uppercase">
        <button onClick={quit} className="px-1 py-1" style={{ color: C.faint }}>
          {"✕"} end session
        </button>
        <button onClick={restart} className="px-1 py-1" style={{ color: C.faint }}>
          {"↻"} restart{wasShuffled ? " (shuffled)" : ""}
        </button>
      </div>
      <div className="flex justify-between items-baseline ui text-xs tracking-wide" style={{ color: C.faint }}>
        <span>
          {inFirstPass
            ? `card ${idx + 1} of ${initialLen}`
            : `repeat ${idx - initialLen + 1} of ${queue.length - initialLen}`}
          {!srs[card.id] ? " · new" : ""}
        </span>
        <span>
          {mode === "write" ? (
            <>
              <span style={{ color: C.paper }}>✓ {score.ok}</span>
              {" · "}
              <span style={{ color: score.no ? C.cinnabar : C.faint }}>✕ {score.no}</span>
              {accuracy !== null && <span> · {accuracy}%</span>}
            </>
          ) : (flipped ? "answer" : "character")}
        </span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.ink3 }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: C.paper, transition: "width 300ms ease" }} />
      </div>
    </div>
  );

  /* ——— write mode ——— */
  if (mode === "write") return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {header}
      <div className="relative w-full max-w-sm">
      <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
      <div className="w-full rounded-lg px-6 py-10 flex flex-col items-center justify-center gap-5"
        {...(verdict !== null ? { onTouchStart, onTouchEnd } : {})}
        style={{ background: C.ink2, border: `1px solid ${C.line}`, minHeight: 300 }}>

        {verdict === null ? (
          <>
            <div className="mono text-3xl text-center" style={{ color: C.paper }}>{card.pinyin}</div>
            <div className="ui text-base text-center leading-relaxed" style={{ color: C.dim }}>{card.meaning}</div>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") check(); }}
              placeholder="type the character"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="hz w-full px-4 py-3 text-2xl text-center rounded border bg-transparent"
              style={{ borderColor: C.line, color: C.paper }}
            />
            <button onClick={check} disabled={!input.trim()}
              className="ui px-8 py-2 text-xs uppercase tracking-widest border rounded"
              style={{ borderColor: C.paper, color: C.paper, opacity: input.trim() ? 1 : 0.35 }}>
              Check
            </button>
          </>
        ) : (
          <>
            <div className="hz font-black" aria-label={verdict === "ok" ? "correct" : "incorrect"}
              style={{ color: verdict === "ok" ? C.paper : C.cinnabar, fontSize: 56, lineHeight: 1 }}>
              {verdict === "ok" ? "✓" : "✕"}
            </div>
            {verdict === "no" && (
              <div className="ui text-xs" style={{ color: C.faint }}>
                you wrote <span className="hz text-base" style={{ color: C.dim }}>{input.trim() || "—"}</span> — repeats at end of deck
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className="hz font-black" style={{ color: C.paper, fontSize: 64, lineHeight: 1.1 }}>{card.hanzi}</div>
              <div className="mono text-lg" style={{ color: C.paper }}>{card.pinyin}</div>
              <div className="ui text-sm text-center" style={{ color: C.dim }}>{card.meaning}</div>
            </div>
            <button onClick={next} className="ui px-8 py-2 text-xs uppercase tracking-widest border rounded"
              style={{ borderColor: C.paper, color: C.paper }}>Next →</button>
          </>
        )}
      </div>
      </div>
    </div>
  );

  /* ——— read mode (tap to flip) ——— */
  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {header}
      <div className="relative w-full max-w-sm">
      <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
      <button
        onClick={flip}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={flipped ? "Show character" : "Reveal answer"}
        className="w-full rounded-lg px-6 py-12 flex flex-col items-center justify-center gap-4"
        style={{ background: C.ink2, border: `1px solid ${C.line}`, minHeight: 300, cursor: "pointer" }}
      >
        {!flipped ? (
          <div className="hz font-black text-center" style={{ color: C.paper, fontSize: card.hanzi.length > 2 ? 64 : 96, lineHeight: 1.1 }}>
            {card.hanzi}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="hz font-semibold" style={{ color: C.dim, fontSize: 40, lineHeight: 1.1 }}>{card.hanzi}</div>
            <div className="mono text-2xl" style={{ color: C.paper }}>{card.pinyin}</div>
            <div className="ui text-base text-center leading-relaxed" style={{ color: C.paper }}>{card.meaning}</div>
            <div className="ui text-xs" style={{ color: C.faint }}>
              {card.pos.join(" · ")}{card.compound ? " · compound" : ""}
              {(card.radical || card.strokes) && (
                <> — {card.radical ? `radical ${card.radical}` : ""}{card.radical && card.strokes ? " · " : ""}{card.strokes ? `${card.strokes} strokes` : ""}</>
              )}
            </div>
            {card.examples && card.examples.length > 0 && (
              <div className="w-full flex flex-col gap-2 pt-3 mt-1" style={{ borderTop: `1px solid ${C.ink3}` }}>
                {card.examples.slice(0, 3).map((ex, i) => (
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
          </div>
        )}
      </button>
      </div>

      <div className="ui text-xs" style={{ color: C.faint }}>tap to flip {"·"} swipe left/right for next/back</div>

      <div className="flex gap-3">
        <button onClick={prev} disabled={idx === 0}
          className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.line, color: C.dim, opacity: idx === 0 ? 0.35 : 1 }}>
          ← Back
        </button>
        <button onClick={next}
          className="ui px-8 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.paper, color: C.paper }}>
          Next →
        </button>
      </div>
    </div>
  );
}

/* ————————————————— filters ————————————————— */
function applyFilters(bank: Card[], srs: SeenMap, f: Filters) {
  return bank.filter(c => {
    if (!f.includeCompound && c.compound) return false;
    if (f.starred && !c.starred) return false;
    if (f.pos.length && !c.pos.some(p => f.pos.includes(p))) return false;
    if (f.age === "new" && srs[c.id]) return false;
    if (f.age === "old" && !srs[c.id]) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const pinyinFlat = normalizePinyin(c.pinyin).letters;
      const qFlat = normalizePinyin(q).letters;
      const hit = c.hanzi.includes(f.q)
        || (qFlat && pinyinFlat.includes(qFlat))
        || c.meaning.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

function FilterBar({ filters, setFilters, posList }: {
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; posList: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <input
        value={filters.q}
        onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
        placeholder="Search hanzi, pinyin, or meaning"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
        style={{ borderColor: C.line, color: C.paper }}
      />
      <div className="flex flex-wrap gap-2">
        {posList.map(p => (
          <Chip key={p} active={filters.pos.includes(p)}
            onClick={() => setFilters(f => ({ ...f, pos: f.pos.includes(p) ? f.pos.filter(x => x !== p) : [...f.pos, p] }))}>
            {p}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={filters.age === "all"} onClick={() => setFilters(f => ({ ...f, age: "all" }))}>all</Chip>
        <Chip active={filters.age === "new"} onClick={() => setFilters(f => ({ ...f, age: "new" }))}>new</Chip>
        <Chip active={filters.age === "old"} onClick={() => setFilters(f => ({ ...f, age: "old" }))}>seen</Chip>
        <span className="w-px h-4" style={{ background: C.line }} />
        <Chip active={filters.includeCompound}
          onClick={() => setFilters(f => ({ ...f, includeCompound: !f.includeCompound }))}>
          {filters.includeCompound ? "compounds: shown" : "compounds: hidden"}
        </Chip>
        <Chip active={filters.starred}
          onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}>
          {"★"} starred
        </Chip>
      </div>
    </div>
  );
}

/* ————————————————— browse ————————————————— */
function BrowseView({ bank, srs, filters, setFilters, posList, onDelete, onDeleteMany, onClearAll, onResetSeen, onToggleStar }: {
  bank: Card[]; srs: SeenMap; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  posList: string[]; onDelete: (id: string) => void; onDeleteMany: (ids: string[]) => void;
  onClearAll: () => void; onResetSeen: (ids: string[] | null) => void; onToggleStar: (id: string) => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const rows = applyFilters(bank, srs, filters);
  const seenCount = bank.filter(c => srs[c.id]).length;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function selectAllFiltered() { setSelected(new Set(rows.map(c => c.id))); }
  function deleteSelected() {
    if (!selected.size) return;
    onDeleteMany([...selected]);
    exitSelect();
  }
  function clearAll() {
    if (!confirmClear) { setConfirmClear(true); setConfirmReset(false); return; }
    onClearAll();
    setConfirmClear(false);
    exitSelect();
  }
  function resetSeen() {
    if (!confirmReset) { setConfirmReset(true); setConfirmClear(false); return; }
    onResetSeen(null);
    setConfirmReset(false);
  }
  function resetSelected() {
    if (!selected.size) return;
    onResetSeen([...selected]);
    exitSelect();
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar filters={filters} setFilters={setFilters} posList={posList} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="ui text-xs" style={{ color: C.faint }}>
          {selectMode ? `${selected.size} selected` : `${rows.length} of ${bank.length} characters`}
        </div>
        {bank.length > 0 && (
          <div className="flex gap-2">
            {!selectMode ? (
              <>
                <button onClick={() => setSelectMode(true)}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>Select</button>
                <button onClick={resetSeen} onBlur={() => setConfirmReset(false)} disabled={!seenCount}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: confirmReset ? C.cinnabar : C.line, color: confirmReset ? C.cinnabar : C.dim, opacity: seenCount ? 1 : 0.5 }}>
                  {confirmReset ? "Tap again to reset" : "Reset seen"}
                </button>
                <button onClick={clearAll} onBlur={() => setConfirmClear(false)}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: confirmClear ? C.cinnabar : C.line, color: confirmClear ? C.cinnabar : C.dim }}>
                  {confirmClear ? "Tap again to clear all" : "Clear all"}
                </button>
              </>
            ) : (
              <>
                <button onClick={selectAllFiltered}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>All shown</button>
                <button onClick={resetSelected} disabled={!selected.size}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: selected.size ? C.dim : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                  Reset ({selected.size})
                </button>
                <button onClick={deleteSelected} disabled={!selected.size}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: selected.size ? C.cinnabar : C.line, color: selected.size ? C.cinnabar : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                  Delete ({selected.size})
                </button>
                <button onClick={exitSelect}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>Cancel</button>
              </>
            )}
          </div>
        )}
      </div>

      {!bank.length && <Empty zh="库空" text="The bank is empty. Import your vocabulary to populate it." />}
      <div className="flex flex-col">
        {rows.map(c => {
          const rec = srs[c.id];
          const ago = rec ? Math.floor((Date.now() - rec.last) / DAY) : null;
          const isSel = selected.has(c.id);
          return (
            <div key={c.id}
              onClick={selectMode ? () => toggle(c.id) : undefined}
              className="flex items-center gap-4 py-3"
              style={{
                borderBottom: `1px solid ${C.ink3}`,
                cursor: selectMode ? "pointer" : "default",
                background: isSel ? C.ink2 : "transparent",
              }}>
              {selectMode && (
                <div aria-hidden="true" className="w-5 h-5 shrink-0 rounded flex items-center justify-center"
                  style={{ border: `1px solid ${isSel ? C.cinnabar : C.line}`, color: C.cinnabar, fontSize: 12 }}>
                  {isSel ? "✕" : ""}
                </div>
              )}
              <div className="hz text-3xl font-semibold w-16 shrink-0" style={{ color: C.paper }}>{c.hanzi}</div>
              <div className="flex-1 min-w-0">
                <div className="mono text-sm" style={{ color: C.paper }}>{c.pinyin}</div>
                <div className="ui text-xs truncate" style={{ color: C.dim }}>{c.meaning}</div>
                <div className="ui text-xs mt-1" style={{ color: C.faint }}>
                  {c.pos.join(" · ")}{c.compound ? " · compound" : ""} — {rec ? (ago === 0 ? "seen today" : `seen ${ago}d ago`) : "new"}
                </div>
              </div>
              {!selectMode && (
                <div className="flex items-center shrink-0">
                  <button onClick={() => onToggleStar(c.id)} aria-label={c.starred ? `Unstar ${c.hanzi}` : `Star ${c.hanzi} as tricky`}
                    className="text-base px-2 py-1" style={{ color: c.starred ? C.cinnabar : C.faint }}>
                    {c.starred ? "★" : "☆"}
                  </button>
                  <button onClick={() => onDelete(c.id)} aria-label={`Delete ${c.hanzi}`}
                    className="ui text-xs px-2 py-1" style={{ color: C.faint }}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ————————————————— import ————————————————— */
const SCHEMA_EXAMPLE = `[
  { "hanzi": "水", "pinyin": "shuǐ", "meaning": "water",
    "pos": ["noun"], "compound": false,
    "radical": "水", "strokes": 4,
    "examples": [{ "zh": "热水", "py": "rè shuǐ", "en": "hot water" }],
    "notes": "Pictograph of a flowing stream." }
]`;

function ImportView({ bank, onImport }: {
  bank: Card[]; onImport: (items: unknown[]) => Promise<{ added: number; updated: number }>;
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    let arr: unknown;
    try {
      arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("Expected a JSON array.");
    } catch (e: any) {
      setMsg({ ok: false, t: e.message });
      return;
    }
    setBusy(true);
    try {
      const { added, updated } = await onImport(arr);
      setMsg({ ok: true, t: `Imported: ${added} new, ${updated} expanded/updated.` });
      setText("");
    } catch (e: any) {
      setMsg({ ok: false, t: e.message || "Import failed." });
    } finally {
      setBusy(false);
    }
  }

  function exportBank() {
    const out = JSON.stringify(bank.map(({ id, added, ...rest }) => rest), null, 2);
    navigator.clipboard && navigator.clipboard.writeText(out);
    setMsg({ ok: true, t: "Bank copied to clipboard as JSON." });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel zh="入" en="import vocabulary" />
      <p className="ui text-xs leading-relaxed" style={{ color: C.dim }}>
        Paste a JSON array. Required per entry: <span className="mono">hanzi</span>, <span className="mono">pinyin</span>, <span className="mono">meaning</span>. Optional: <span className="mono">pos</span>, <span className="mono">compound</span>, <span className="mono">radical</span>, <span className="mono">strokes</span>, <span className="mono">examples</span>, <span className="mono">notes</span>. Re-importing an existing hanzi expands it: new fields fill in, examples and pos merge without duplicates, and omitted fields are kept as-is.
      </p>
      <pre className="mono text-xs p-3 rounded overflow-x-auto" style={{ background: C.ink2, color: C.faint, border: `1px solid ${C.line}` }}>{SCHEMA_EXAMPLE}</pre>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        rows={8} placeholder="Paste JSON here"
        className="mono w-full p-3 text-xs rounded border bg-transparent"
        style={{ borderColor: C.line, color: C.paper }}
      />
      <div className="flex gap-3">
        <button onClick={run} disabled={!text.trim() || busy}
          className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: text.trim() && !busy ? 1 : 0.35 }}>
          {busy ? "Importing…" : "Import"}
        </button>
        <button onClick={exportBank} disabled={!bank.length}
          className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.line, color: C.dim, opacity: bank.length ? 1 : 0.35 }}>Copy bank</button>
      </div>
      {msg && <div className="ui text-xs" style={{ color: msg.ok ? C.dim : C.cinnabar }}>{msg.t}</div>}
    </div>
  );
}

function Empty({ zh, text }: { zh: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="hz text-5xl" style={{ color: C.faint }}>{zh}</div>
      <p className="ui text-xs text-center max-w-xs leading-relaxed" style={{ color: C.dim }}>{text}</p>
    </div>
  );
}

/* ————————————————— app ————————————————— */
const DEFAULT_POS = ["noun", "verb", "pronoun", "adjective", "adverb", "measure word", "particle"];

export default function App({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [bank, setBank] = useState<Card[]>([]);
  const [srs, setSrs] = useState<SeenMap>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"study" | "browse" | "import">("study");
  const [filters, setFilters] = useState<Filters>({ q: "", pos: [], includeCompound: false, age: "all", starred: false });
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [theme, setTheme] = useState<Theme>("light");

  const storageRef = useRef<ApiStorage | null>(null);
  if (!storageRef.current) storageRef.current = new ApiStorage(setSyncState);
  const storage = storageRef.current;

  useEffect(() => {
    (async () => {
      try {
        const { bank: b, srs: s, theme: t } = await storage.load();
        applyTheme(t); setTheme(t);
        setBank(b); setSrs(s); setLoaded(true);
      } catch (err) {
        if (err instanceof ApiError) onLogout(); // session expired server-side
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the offline cache warm on every change, regardless of which action caused it.
  useEffect(() => {
    if (loaded) storage.cacheSnapshot(bank, srs, theme);
  }, [bank, srs, theme, loaded, storage]);

  function toggleTheme() {
    const t: Theme = theme === "light" ? "dark" : "light";
    applyTheme(t);
    setTheme(t);
    storage.setTheme(t).catch(() => {});
  }

  const posList = useMemo(() => {
    const s = new Set(DEFAULT_POS);
    bank.forEach(c => c.pos.forEach(p => s.add(p)));
    return [...s];
  }, [bank]);

  const onSeen = (id: string) => {
    const prev = srs[id] || { views: 0, last: 0 };
    setSrs({ ...srs, [id]: { last: Date.now(), views: (prev.views || 0) + 1 } }); // optimistic
    storage.markSeen(id).then(rec => {
      if (rec) setSrs(s => ({ ...s, [id]: rec })); // reconcile with server truth
    }).catch(() => {});
  };

  const onImport = async (items: unknown[]) => {
    const { cards, added, updated } = await storage.importCards(items); // server computes the merge
    setBank(cards);
    return { added, updated };
  };

  const onDelete = (id: string) => {
    setBank(b => b.filter(c => c.id !== id));
    setSrs(s => { const { [id]: _drop, ...rest } = s; return rest; });
    storage.deleteCards([id]).catch(() => {});
  };

  const onDeleteMany = (ids: string[]) => {
    const drop = new Set(ids);
    setBank(b => b.filter(c => !drop.has(c.id)));
    setSrs(s => Object.fromEntries(Object.entries(s).filter(([k]) => !drop.has(k))));
    storage.deleteCards(ids).catch(() => {});
  };

  const onClearAll = () => {
    setBank([]); setSrs({});
    storage.clearAll().catch(() => {});
  };

  const onToggleStar = (id: string) => {
    const card = bank.find(c => c.id === id);
    setBank(b => b.map(c => c.id === id ? { ...c, starred: !c.starred } : c));
    storage.patchCard(id, { starred: !card?.starred }).catch(() => {});
  };

  const onResetSeen = (ids: string[] | null) => {
    if (!ids) {
      setSrs({});
    } else {
      const drop = new Set(ids);
      setSrs(s => Object.fromEntries(Object.entries(s).filter(([k]) => !drop.has(k))));
    }
    storage.resetSeen(ids).catch(() => {});
  };

  const TABS = [
    { id: "study" as const, zh: "学", en: "Study" },
    { id: "browse" as const, zh: "查", en: "Browse" },
    { id: "import" as const, zh: "入", en: "Import" },
  ];

  const syncLabel = syncState === "offline" ? "offline — cached locally"
    : syncState === "syncing" ? "syncing…" : "✓ synced";

  return (
    <div className="min-h-screen w-full" style={{ background: C.ink, color: C.paper }}>
      <style>{FONT_CSS}</style>
      <div className="max-w-md mx-auto px-4 pb-24 pt-6">
        <header className="flex items-end justify-between mb-6">
          <div>
            <div className="hz text-2xl font-black tracking-wide" style={{ color: C.paper }}>字帖</div>
            <div className="ui text-xs uppercase tracking-widest mt-1" style={{ color: C.faint }}>character study</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {userEmail && (
              <div className="ui text-xs max-w-[180px] truncate" style={{ color: C.dim }} title={userEmail}>
                {userEmail}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                className="px-2 py-1 rounded border flex items-center gap-1"
                style={{ borderColor: C.line, color: C.dim }}>
                <span className="hz text-sm leading-none">{theme === "light" ? "暗" : "明"}</span>
                <span className="ui text-xs uppercase tracking-widest">{theme === "light" ? "dark" : "light"}</span>
              </button>
              <button onClick={onLogout}
                className="px-2 py-1 rounded border ui text-xs uppercase tracking-widest"
                style={{ borderColor: C.line, color: C.dim }}>
                Log out
              </button>
            </div>
            <div className="ui text-xs" style={{ color: C.faint }}>{bank.length} in bank</div>
            <div className="ui text-xs" style={{ color: syncState === "offline" ? C.cinnabar : C.faint }}>
              {syncLabel}
            </div>
          </div>
        </header>

        {!loaded ? (
          <div className="ui text-xs pt-10 text-center" style={{ color: C.faint }}>loading…</div>
        ) : (
          <>
            {tab === "study" && <StudyView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onSeen={onSeen} onToggleStar={onToggleStar} />}
            {tab === "browse" && <BrowseView bank={bank} srs={srs} filters={filters} setFilters={setFilters} posList={posList} onDelete={onDelete} onDeleteMany={onDeleteMany} onClearAll={onClearAll} onResetSeen={onResetSeen} onToggleStar={onToggleStar} />}
            {tab === "import" && <ImportView bank={bank} onImport={onImport} />}
          </>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0" style={{ background: C.ink2, borderTop: `1px solid ${C.line}` }}>
        <div className="max-w-md mx-auto flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-3 flex flex-col items-center gap-1"
              style={{ color: tab === t.id ? C.paper : C.faint }}>
              <span className="hz text-lg leading-none">{t.zh}</span>
              <span className="ui text-xs uppercase tracking-widest">{t.en}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
