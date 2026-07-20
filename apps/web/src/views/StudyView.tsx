import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, Empty, StarBtn, StarToggle, Switch } from "../components/atoms";
import { applyFilters, type Filters } from "../lib/filters";
import { POS_HANZI } from "../lib/posLabels";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

interface StackSession { ids: string[]; nonce: number }

const AGE_OPTIONS: { value: Filters["age"]; label: string }[] = [
  { value: "all", label: "all" },
  { value: "new", label: "unseen" },
  { value: "old", label: "seen" },
];

/* ————————————— study session: read (tap-to-flip) + write (reverse, typed) ————————————— */
export function StudyView({ bank, srs, filters, setFilters, posList, onSeen, onToggleStar, stackSession, onExitStackSession, stack, onStudyStack }: {
  bank: Card[]; srs: SeenMap; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  posList: string[]; onSeen: (id: string) => void; onToggleStar: (id: string) => void;
  stackSession?: StackSession | null; onExitStackSession?: () => void;
  stack: string[]; onStudyStack: () => void;
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

  // A stack session bypasses the lesson-filter pool entirely and studies
  // exactly the preselected cards, in the order they were stacked.
  const pool = useMemo(() => {
    if (stackSession) {
      const byId = new Map(bank.map(c => [c.id, c]));
      return stackSession.ids.map(id => byId.get(id)).filter((c): c is Card => !!c);
    }
    return applyFilters(bank, srs, filters);
  }, [bank, srs, filters, stackSession]);
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

  // Land on the (stack-aware) picker whenever a new stack session is requested
  // — never auto-begin, so the read/write toggle still applies: the user
  // picks a mode same as any lesson, then presses In order/Shuffle. Also
  // interrupts any session already in progress so the picker is reachable.
  const lastStackRequest = useRef<number | null>(null);
  useEffect(() => {
    if (stackSession && stackSession.nonce !== lastStackRequest.current) {
      lastStackRequest.current = stackSession.nonce;
      quit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackSession?.nonce]);

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
      {stackSession ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-2">
            <span className="hz text-base" style={{ color: C.dim }}>{"▤"}</span>
            <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>your stack</span>
          </div>
          {onExitStackSession && (
            <button onClick={onExitStackSession} className="ui text-xs" style={{ color: C.faint }}>
              {"✕"} exit stack mode — back to lessons
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="hz text-base" style={{ color: C.dim }}>课</span>
            <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>lesson</span>
          </div>
          <button onClick={onStudyStack} disabled={!stack.length}
            className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded-full"
            style={{ borderColor: C.line, color: stack.length ? C.dim : C.faint, opacity: stack.length ? 1 : 0.5 }}>
            {"▤"} study stack{stack.length ? ` (${stack.length})` : ""}
          </button>
          <div className="flex flex-wrap gap-2 justify-center max-w-sm">
            <Chip active={filters.pos.length === 0}
              onClick={() => setFilters(f => ({ ...f, pos: [] }))}>
              all
            </Chip>
            {posList.map(p => (
              <Chip key={p} active={filters.pos.includes(p)}
                onClick={() => setFilters(f => ({ ...f, pos: f.pos.includes(p) ? f.pos.filter(x => x !== p) : [...f.pos, p] }))}>
                {POS_HANZI[p] && <span className="hz">{POS_HANZI[p]} </span>}{p}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-center items-center">
            <StarToggle active={filters.starred} label={filters.starred ? "Showing starred only — tap to show all" : "Show starred only"}
              onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))} />
            <Switch value={filters.age} options={AGE_OPTIONS}
              onChange={age => setFilters(f => ({ ...f, age }))} />
          </div>
        </div>
      )}
      <div className="ui text-sm" style={{ color: C.dim }}>
        <span style={{ color: C.paper }}>{pool.length}</span> cards
        {unseenCount > 0 && <> · <span style={{ color: C.paper }}>{unseenCount}</span> unseen</>}
        <span style={{ color: C.faint }}> ({stackSession ? "in stack" : "this lesson"})</span>
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
        <p className="ui text-xs" style={{ color: C.faint }}>
          {stackSession ? "Your stack is empty." : "Nothing matches the current filters."}
        </p>
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
