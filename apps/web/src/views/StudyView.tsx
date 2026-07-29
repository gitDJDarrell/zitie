import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, Collapsible, Empty, MultiSelect, Slider, SpeakBtn, StarBtn, StarToggle, Switch } from "../components/atoms";
import { availableLevels, buildSession, DIFFICULTY_STEPS, filterByLevels, sessionSize, stepFor } from "../lib/difficulty";
import { checkAnswer, type AnswerKind } from "../lib/answer";
import { CHOICE_COUNT, meaningChoices } from "../lib/choices";
import { applyFilters, type Filters } from "../lib/filters";
import { POS_HANZI } from "../lib/posLabels";
import { canSpeak, speak } from "../lib/speech";
import { BrushPad, type PadMode, type Surface } from "../components/BrushPad";
import { DEFAULT_INK, type InkParams } from "../lib/ink";
import { brushOutcome, type Verdict } from "../lib/strokes";
import { useStrokes } from "../lib/useStrokes";
import { countDue, formatInterval, previewIntervalDays, PROOF_GLYPH, proofsOf } from "../lib/srs";
import { C } from "../theme";
import type { Card, Grade, Proof, SeenMap, StudyOrigin } from "../types";

/**
 * A preselected run: exactly these cards, in this order. `origin` says where
 * the selection came from, because the two callers are different promises —
 * the saved stack is a list you curated and can come back to, a dex selection
 * is a one-off that leaves the stack alone. Calling both "your stack" would be
 * a lie in one of the two cases.
 */
export interface StackSession {
  ids: string[];
  nonce: number;
  origin?: StudyOrigin;
}

/** The three ways a card can be studied — and the three proofs a dex slot wants. */
type StudyMode = "read" | "write" | "brush";

// The ink controls, and how finely each one steps. Kept as data so the panel
// is a map rather than five near-identical blocks.
const INK_SLIDERS: { key: "weight" | "wetness" | "speed" | "formality"; label: string; steps: number }[] = [
  { key: "weight", label: "weight", steps: 100 },
  { key: "wetness", label: "wetness", steps: 100 },
  { key: "speed", label: "speed", steps: 100 },
  { key: "formality", label: "formality", steps: 100 },
];

const STACK_ORIGIN: StudyOrigin = {
  zh: "▤", label: "your stack", noun: "stacked", emptyText: "Your stack is empty.",
};

const AGE_OPTIONS: { value: Filters["age"]; label: string }[] = [
  { value: "all", label: "all" },
  { value: "new", label: "unseen" },
  { value: "old", label: "seen" },
];

// Order matters: this is the left-to-right button row, hardest recall first.
const GRADES: { grade: Grade; label: string; zh: string }[] = [
  { grade: "again", label: "Again", zh: "忘" },
  { grade: "hard", label: "Hard", zh: "难" },
  { grade: "good", label: "Good", zh: "好" },
  { grade: "easy", label: "Easy", zh: "易" },
];

/* ————————————— study session: read (tap-to-flip) + write (reverse, typed) ————————————— */
export function StudyView({ bank, srs, filters, setFilters, posList, onSeen, onGrade, onToggleStar, stackSession, onExitStackSession, stack, onStudyStack, difficulty, onSetDifficulty, autoSpeak, onToggleAutoSpeak }: {
  bank: Card[]; srs: SeenMap; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  posList: string[]; onSeen: (id: string) => void;
  onGrade: (id: string, grade: Grade, proof?: Proof) => void;
  onToggleStar: (id: string) => void;
  stackSession?: StackSession | null; onExitStackSession?: () => void;
  stack: string[]; onStudyStack: () => void;
  difficulty: number; onSetDifficulty: (d: number) => void;
  autoSpeak: boolean; onToggleAutoSpeak: () => void;
}) {
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<StudyMode>("read");
  const [flipped, setFlipped] = useState(false);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<null | "ok" | "no">(null);
  // Which form the answer took — characters or reading. Drives both the grade
  // and the nudge shown on the reveal.
  const [answerKind, setAnswerKind] = useState<AnswerKind>(null);
  // The option tapped in read mode. Null before answering; the card reveals
  // itself the moment one is chosen, so this doubles as "has been answered".
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ ok: 0, no: 0 });
  const [initialLen, setInitialLen] = useState(0);
  const [levels, setLevels] = useState<string[]>([]); // empty = every level
  const [filtersOpen, setFiltersOpen] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  // Brush mode. The ink and paper settings persist across cards within a
  // session — a hand you've dialled in shouldn't reset every time the card
  // turns over.
  const [ink, setInk] = useState<InkParams>(DEFAULT_INK);
  const [surface, setSurface] = useState<Surface>("grid");
  const [padMode, setPadMode] = useState<PadMode>("write");
  const [showStrokeOrder, setShowStrokeOrder] = useState(false);
  const [inkOpen, setInkOpen] = useState(false);
  const [brushDone, setBrushDone] = useState(false);
  const [brushVerdict, setBrushVerdict] = useState<Verdict | null>(null);

  // A stack session bypasses the lesson-filter pool entirely and studies
  // exactly the preselected cards, in the order they were stacked.
  const pool = useMemo(() => {
    if (stackSession) {
      const byId = new Map(bank.map(c => [c.id, c]));
      return stackSession.ids.map(id => byId.get(id)).filter((c): c is Card => !!c);
    }
    return filterByLevels(applyFilters(bank, srs, filters), levels);
  }, [bank, srs, filters, levels, stackSession]);

  const levelOptions = useMemo(() => availableLevels(bank), [bank]);

  // What the collapsed filter header advertises, so folding it away never
  // hides an active constraint.
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.starred) parts.push("★ starred");
    if (filters.age !== "all") parts.push(filters.age === "new" ? "unseen" : "seen");
    if (filters.pos.length) parts.push(filters.pos.join(", "));
    return parts.length ? parts.join(" · ") : "none";
  }, [filters]);
  const card = queue && queue[idx] ? bank.find(c => c.id === queue[idx]) : null;

  // Read mode's options, re-rolled on every card visit — a card that comes
  // back at the end of the deck should be a test of the character again, not
  // of which option was highlighted last time.
  const options = useMemo(
    () => (card ? meaningChoices(card, bank) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id, idx, bank],
  );
  // Stroke geometry for the card on screen — fetched once per character and
  // cached, so flipping back and forth costs nothing and an offline session can
  // still practise anything already seen.
  const strokeState = useStrokes(card?.hanzi);

  const unseenCount = pool.filter(c => !srs[c.id]).length;
  const dueCount = useMemo(() => countDue(pool, srs), [pool, srs]);

  // A stack session is an explicit lineup — the difficulty slider doesn't get
  // to trim it. Everything else is drawn to the current difficulty step.
  const sessionCards = useMemo(
    () => stackSession ? pool : buildSession(pool, srs, difficulty),
    [pool, srs, difficulty, stackSession],
  );

  const [wasShuffled, setWasShuffled] = useState(false);

  function begin(shuffle: boolean) {
    let q = sessionCards.map(c => c.id);
    if (shuffle) q = [...q].sort(() => Math.random() - 0.5);
    setQueue(q); setIdx(0); setWasShuffled(shuffle);
    setScore({ ok: 0, no: 0 }); setInitialLen(q.length);
    reset(); // every per-card flag, so a fresh deck never opens mid-answer
  }

  function quit() {
    setQueue(null); setIdx(0);
    setScore({ ok: 0, no: 0 });
    reset();
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
    if (!flipped && card) {
      onSeen(card.id);
      if (autoSpeak) speak(card.hanzi); // the tap itself is the gesture browsers require
    }
    setFlipped(f => !f);
  }

  // Rate the card, then advance. "Again" re-queues it at the end of the deck
  // so it genuinely comes back this session, matching the 10-minute relearn
  // step the server schedules.
  function grade(g: Grade) {
    if (!card) return;
    onGrade(card.id, g);
    if (g === "again") setQueue(q => [...(q as string[]), card.id]);
    next();
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
    const kind = checkAnswer(input, card);
    setAnswerKind(kind);
    const ok = kind !== null;
    setVerdict(ok ? "ok" : "no");
    setScore(s => ok ? { ...s, ok: s.ok + 1 } : { ...s, no: s.no + 1 });
    if (!ok) setQueue(q => [...(q as string[]), card.id]); // shuffle miss to end of deck
    // Producing the characters is the harder recall and the thing this app
    // teaches; giving only the reading is a step short of it, so it grades
    // "hard" rather than "good" and comes back sooner.
    // Producing the characters is the harder recall, so the reading alone
    // grades "hard" — but both are a genuine production of the answer from the
    // English, and both count as the write proof. Requiring the characters
    // would shut out anyone without a Chinese keyboard.
    onGrade(card.id, kind === "hanzi" ? "good" : kind === "pinyin" ? "hard" : "again", ok ? "write" : undefined);
    if (autoSpeak) speak(card.hanzi);
  }

  /**
   * Brush mode's answer, handed in by the learner rather than detected by the
   * pad. An attempt is gradeable whether or not it's right — that's the point
   * of grading it. Completeness earns the proof; stroke order and stray marks
   * only shade the grade, because someone who wrote the character with the box
   * built the wrong way round has still written the character. An incomplete
   * attempt grades "again" and goes back to the end of the deck, exactly as a
   * wrong answer does in read and write mode.
   *
   * A null verdict means the character has no stroke data to check against.
   * There's nothing to be right or wrong about, so it schedules on trust and
   * banks no proof — claiming one we couldn't verify would be a lie.
   */
  function onBrushSubmit(v: Verdict | null) {
    if (!card || brushDone) return;
    setBrushDone(true);
    setBrushVerdict(v);
    onSeen(card.id);

    const { grade, earnsProof, requeue, correct } = brushOutcome(v);
    setScore(s => correct ? { ...s, ok: s.ok + 1 } : { ...s, no: s.no + 1 });
    onGrade(card.id, grade, earnsProof ? "brush" : undefined);
    if (requeue) setQueue(q => [...(q as string[]), card.id]);
    if (autoSpeak) speak(card.hanzi);
  }

  /** How the handed-in attempt actually did, for the reveal. */
  function brushSummary(v: Verdict | null): string | null {
    if (!v) return null;
    if (v.perfect) return "written as taught";
    if (v.complete && !v.orderOk) return "every stroke down, but in a different order";
    if (v.complete) return `every stroke down · ${v.stray} stray mark${v.stray === 1 ? "" : "s"}`;
    const missed = v.expected - v.matched;
    return `${v.matched} of ${v.expected} strokes · ${missed} missed — it comes back later in this session`;
  }

  /**
   * Read mode's answer: the meaning picked out of the options. Correct grades
   * "good" and banks the read proof, wrong grades "again" and sends the card
   * back to the end of the deck — the same contract write mode already has, so
   * both directions are tests rather than one test and one self-report.
   */
  function choose(option: string) {
    if (!card || picked !== null) return;
    const ok = option === card.meaning;
    setPicked(option);
    setVerdict(ok ? "ok" : "no");
    setFlipped(true);
    setScore(s => ok ? { ...s, ok: s.ok + 1 } : { ...s, no: s.no + 1 });
    if (!ok) setQueue(q => [...(q as string[]), card.id]);
    onSeen(card.id);
    onGrade(card.id, ok ? "good" : "again", ok ? "read" : undefined);
    if (autoSpeak) speak(card.hanzi);
  }

  function next() { setIdx(i => i + 1); reset(); }
  function prev() { setIdx(i => Math.max(i - 1, 0)); reset(); }
  function reset() {
    setFlipped(false); setInput(""); setVerdict(null);
    setAnswerKind(null); setPicked(null); setBrushDone(false); setBrushVerdict(null);
  }

  if (!bank.length) return (
    <Empty zh="库空" text="No characters yet. Open Import and paste your vocabulary to begin." />
  );

  // Read mode is a recognition test whenever the bank can field plausible
  // wrong answers. Below that — a handful of cards — there is nothing to
  // choose between, so it stays the classic flip-and-self-rate.
  const quiz = mode === "read" && options.length > 0;
  // Whether read mode will be a quiz at all — a property of the bank rather
  // than of one card, so the mode chip can say which it is before you start.
  // Gated on the bank, not the session: distractors are drawn from every card
  // you own, so a one-card stack is still a quiz.
  const quizAvailable = bank.length >= CHOICE_COUNT
    && (!pool[0] || meaningChoices(pool[0], bank).length > 0);

  const step = stepFor(difficulty);
  // What is still owed before this character earns its dex slot, shown the
  // moment a proof lands. The goal belongs where it is being pursued, not
  // only on the gallery screen the user may not have opened yet.
  const proofHint = ((): string | null => {
    if (!card) return null;
    const proofs = proofsOf(srs[card.id]);
    const owed = PROOF_GLYPH.filter(g => !proofs[g.key]);
    if (!owed.length) return null;              // earned — the banner says so
    // Only nudge once the character is genuinely close, and never toward the
    // mode you are already in: "write it" is not news while you are writing it.
    const elsewhere = owed.filter(g => g.key !== mode);
    if (!elsewhere.length || elsewhere.length === PROOF_GLYPH.length) return null;
    const names: Record<string, string> = {
      read: "認 recognise it from the character",
      write: "写 write it from the English",
      brush: "描 brush it by hand",
    };
    return `${elsewhere.map(g => names[g.key]).join(", then ")} to collect it.`;
  })();
  const plannedCount = stackSession ? pool.length : sessionSize(pool, difficulty);
  const origin = stackSession?.origin ?? STACK_ORIGIN;

  /* ——— session start ——— */
  if (!queue) return (
    <div className="flex flex-col items-center gap-6 pt-10">
      {stackSession ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-2">
            <span className="hz text-base" style={{ color: C.dim }}>{origin.zh}</span>
            <span className="ui t-label" style={{ color: C.faint }}>{origin.label}</span>
          </div>
          {onExitStackSession && (
            <button onClick={onExitStackSession} className="ui text-xs" style={{ color: C.faint }}>
              {"✕"} exit — back to lessons
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="flex items-baseline gap-2">
            <span className="hz text-base" style={{ color: C.dim }}>课</span>
            <span className="ui t-label" style={{ color: C.faint }}>lesson</span>
          </div>
          {/* Which material — an explicit level choice, independent of how
              hard the session is. Defaults to everything in the bank. */}
          <MultiSelect label="levels" allLabel="All levels"
            options={levelOptions} selected={levels} onChange={setLevels} />

          {/* How hard — session length and how much of it is cards you're
              shaky on versus comfortable revision. */}
          <div className="w-full flex flex-col gap-1" style={{ color: C.paper }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="ui t-label" style={{ color: C.faint }}>difficulty</span>
              <span className="ui t-meta text-right" style={{ color: C.dim }}>
                <span className="hz" style={{ color: C.paper }}>{step.zh}</span>{" "}
                <span style={{ color: C.paper }}>{step.label}</span>
                {" — "}{plannedCount} card{plannedCount === 1 ? "" : "s"}
              </span>
            </div>
            <Slider value={difficulty} max={DIFFICULTY_STEPS.length - 1}
              onChange={onSetDifficulty} label="Session difficulty"
              ticks={DIFFICULTY_STEPS.map(s => s.zh)} />
          </div>

          {/* Everything else stays folded away — the study screen should lead
              with "start", not with a wall of chips. */}
          <Collapsible label="filters" open={filtersOpen} onToggle={() => setFiltersOpen(o => !o)}
            summary={filterSummary}>
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex flex-wrap gap-3 justify-center items-center">
                <StarToggle active={filters.starred} label={filters.starred ? "Showing starred only — tap to show all" : "Show starred only"}
                  onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))} />
                <Switch value={filters.age} options={AGE_OPTIONS}
                  onChange={age => setFilters(f => ({ ...f, age }))} />
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => setFilters(f => ({ ...f, pos: [] }))} disabled={!filters.pos.length}
                  className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
                  style={{ borderColor: C.line, color: filters.pos.length ? C.dim : C.faint, opacity: filters.pos.length ? 1 : 0.5 }}>
                  Clear
                </button>
                {posList.map(p => (
                  <Chip key={p} active={filters.pos.includes(p)}
                    onClick={() => setFilters(f => ({ ...f, pos: f.pos.includes(p) ? f.pos.filter(x => x !== p) : [...f.pos, p] }))}>
                    {POS_HANZI[p] && <span className="hz">{POS_HANZI[p]} </span>}{p}
                  </Chip>
                ))}
              </div>
            </div>
          </Collapsible>

          <button onClick={onStudyStack} disabled={!stack.length}
            className="ui t-btn px-3 py-1 border rounded-full"
            style={{ borderColor: C.line, color: stack.length ? C.dim : C.faint, opacity: stack.length ? 1 : 0.5 }}>
            {"▤"} study stack{stack.length ? ` (${stack.length})` : ""}
          </button>
        </div>
      )}
      <div className="ui t-meta text-center" style={{ color: C.dim }}>
        <div>
          <span style={{ color: C.paper }}>{plannedCount}</span> in this session
          <span style={{ color: C.faint }}> · drawn from {pool.length} {stackSession ? origin.noun : "matching"}</span>
        </div>
        <div style={{ color: C.faint }}>
          {dueCount > 0 && <><span style={{ color: C.paper }}>{dueCount}</span> due for review</>}
          {dueCount > 0 && unseenCount > 0 && " · "}
          {unseenCount > 0 && <><span style={{ color: C.paper }}>{unseenCount}</span> never studied</>}
          {dueCount === 0 && unseenCount === 0 && "nothing due — you're ahead"}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap justify-center items-center">
        <Chip active={mode === "read"} onClick={() => setMode("read")}>
          认 read — {quizAvailable ? "pick the meaning" : "flip cards"}
        </Chip>
        <Chip active={mode === "write"} onClick={() => setMode("write")}>写 write — type hanzi</Chip>
        <Chip active={mode === "brush"} onClick={() => setMode("brush")}>描 brush — write by hand</Chip>
        {canSpeak() && (
          <Chip active={autoSpeak} onClick={onToggleAutoSpeak}>
            {autoSpeak ? "🔊" : "🔇"} say it aloud
          </Chip>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={() => begin(false)} disabled={!plannedCount}
          className="ui t-btn px-6 py-3 border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: plannedCount ? 1 : 0.35 }}>
          In order
        </button>
        <button onClick={() => begin(true)} disabled={!plannedCount}
          className="ui t-btn px-6 py-3 border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: plannedCount ? 1 : 0.35 }}>
          Shuffle
        </button>
      </div>
      {mode === "write" && (
        <p className="ui t-body text-center max-w-xs" style={{ color: C.faint }}>
          Write mode needs a Chinese keyboard (pinyin IME) enabled on your device.
          Brush mode doesn't — you draw the character instead.
        </p>
      )}
      {mode === "brush" && (
        <p className="ui t-body text-center max-w-xs" style={{ color: C.faint }}>
          Draw each stroke with a finger or the mouse. Every stroke of the
          character earns the slot; the order is coached, not required.
        </p>
      )}
      {!plannedCount && (
        <p className="ui t-body" style={{ color: C.faint }}>
          {stackSession ? origin.emptyText : "Nothing matches the current filters."}
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
          {total > 0
            ? <>Deck complete — ✓ {score.ok} · ✕ {score.no} · {Math.round((score.ok / total) * 100)}% accuracy</>
            : <>Deck complete — {queue.length} card{queue.length === 1 ? "" : "s"} reviewed.</>}
        </p>
        <div className="flex gap-3">
          <button onClick={() => begin(true)} className="ui px-6 py-2 t-btn border rounded"
            style={{ borderColor: C.paper, color: C.paper }}>Again (shuffled)</button>
          <button onClick={() => setQueue(null)} className="ui px-6 py-2 t-btn border rounded"
            style={{ borderColor: C.line, color: C.dim }}>Back</button>
        </div>
      </div>
    );
  }

  /* ——— shared header ——— */
  const inFirstPass = idx < initialLen;
  const graded = score.ok + score.no;
  const accuracy = graded ? Math.round((score.ok / graded) * 100) : null;
  const scored = mode === "write" || mode === "brush" || quiz;
  const progress = scored
    ? graded / (graded + (queue.length - idx))
    : (idx + 1) / queue.length;

  const header = (
    <div className="w-full max-w-sm flex flex-col gap-2">
      <div className="flex justify-between ui t-label">
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
          {scored ? (
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

  /* ——— brush mode: write it by hand ——— */
  if (mode === "brush") return (
    <div className="flex flex-col items-center gap-4 pt-4">
      {header}
      <div className="relative w-full max-w-sm flex flex-col items-center gap-3">
        <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
        {/* The prompt is the English, same as write mode: the character is what
            you're producing, so showing it would defeat the exercise —
            except in trace mode, where copying the shape *is* the exercise. */}
        <div className="ui text-lg text-center leading-snug px-8" style={{ color: C.paper }}>
          {card.meaning}
        </div>
        <div className="mono t-meta" style={{ color: C.faint }}>{card.pinyin}</div>

        <BrushPad
          key={card.id}
          hanzi={card.hanzi}
          target={strokeState.data}
          ink={ink}
          onInk={setInk}
          surface={surface}
          mode={padMode}
          showStrokeOrder={showStrokeOrder}
          onSubmit={onBrushSubmit}
          submitted={brushDone}
        />

        {brushDone ? (
          <div className="w-full flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="hz font-black" style={{ color: C.paper, fontSize: 44, lineHeight: 1.1 }}>{card.hanzi}</div>
              <div className="flex items-center gap-1">
                <div className="mono text-base" style={{ color: C.paper }}>{card.pinyin}</div>
                <SpeakBtn text={card.hanzi} />
              </div>
            </div>
            {/* What the attempt scored. A miss is stated plainly rather than
                hidden — being told which strokes went astray is the lesson. */}
            {brushSummary(brushVerdict) && (
              <div className="ui t-meta text-center max-w-xs"
                style={{ color: brushVerdict?.complete ? C.paper : C.cinnabar }}>
                {brushSummary(brushVerdict)}
              </div>
            )}
            {proofHint && (
              <div className="ui t-meta text-center max-w-xs" style={{ color: C.faint }}>{proofHint}</div>
            )}
            <button onClick={next} className="ui px-8 py-2 t-btn border rounded"
              style={{ borderColor: C.paper, color: C.paper }}>Next →</button>
          </div>
        ) : (
          // Distinct from submit: skipping records nothing at all, for a
          // character you don't want to attempt rather than one you got wrong.
          <button onClick={next} className="ui t-btn px-4 py-1" style={{ color: C.faint }}>
            skip this one »
          </button>
        )}

        {/* The ink and paper controls, folded away — the pad should lead with
            paper to write on, not with five sliders. */}
        <Collapsible label="墨 ink & paper" open={inkOpen} onToggle={() => setInkOpen(o => !o)}
          summary={`${padMode}${showStrokeOrder ? " · numbered" : ""} · ${surface}`}>
          <div className="w-full flex flex-col gap-3">
            {INK_SLIDERS.map(({ key, label, steps }) => (
              <div key={key} className="w-full flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="ui t-label" style={{ color: C.faint }}>{label}</span>
                  <span className="mono t-micro" style={{ color: C.dim }}>{ink[key].toFixed(2)}</span>
                </div>
                <Slider value={Math.round(ink[key] * steps)} max={steps} label={label}
                  onChange={v => setInk(i => ({ ...i, [key]: v / steps }))} />
              </div>
            ))}
            <div className="w-full flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="ui t-label" style={{ color: C.faint }}>seed</span>
                <span className="mono t-micro" style={{ color: C.dim }}>{ink.seed}</span>
              </div>
              <Slider value={ink.seed} max={99} label="Brush seed"
                onChange={v => setInk(i => ({ ...i, seed: v }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-center">
              <Switch value={surface} options={[
                { value: "plain" as const, label: "plain" },
                { value: "grid" as const, label: "grid" },
                { value: "scroll" as const, label: "scroll" },
              ]} onChange={setSurface} />
              <Switch value={padMode} options={[
                { value: "write" as const, label: "write" },
                { value: "trace" as const, label: "trace" },
              ]} onChange={setPadMode} />
              <Chip active={showStrokeOrder} onClick={() => setShowStrokeOrder(v => !v)}>
                習 stroke order
              </Chip>
            </div>
          </div>
        </Collapsible>
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
            {/* English only — showing the pinyin here would hand over half
                the answer, since the reading is now an accepted response. */}
            <div className="ui text-2xl text-center leading-snug" style={{ color: C.paper }}>{card.meaning}</div>
            <div className="ui t-meta" style={{ color: C.faint }}>
              {card.pos.join(" · ")}{card.compound ? " · compound" : ""}
            </div>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") check(); }}
              placeholder="characters or pinyin"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="hz w-full px-4 py-3 text-2xl text-center rounded border bg-transparent"
              style={{ borderColor: C.line, color: C.paper }}
            />
            <button onClick={check} disabled={!input.trim()}
              className="ui px-8 py-2 t-btn border rounded"
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
              <div className="ui t-meta text-center" style={{ color: C.faint }}>
                you wrote <span className="hz text-base" style={{ color: C.dim }}>{input.trim() || "—"}</span> — repeats at end of deck
              </div>
            )}
            {answerKind === "pinyin" && (
              <div className="ui t-meta text-center max-w-xs" style={{ color: C.faint }}>
                Reading correct — try for the characters next time.
              </div>
            )}
            {verdict === "ok" && proofHint && (
              <div className="ui t-meta text-center max-w-xs" style={{ color: C.faint }}>{proofHint}</div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className="hz font-black" style={{ color: C.paper, fontSize: 64, lineHeight: 1.1 }}>{card.hanzi}</div>
              <div className="flex items-center gap-1">
                <div className="mono text-lg" style={{ color: C.paper }}>{card.pinyin}</div>
                <SpeakBtn text={card.hanzi} />
              </div>
              <div className="ui text-sm text-center" style={{ color: C.dim }}>{card.meaning}</div>
            </div>
            <button onClick={next} className="ui px-8 py-2 t-btn border rounded"
              style={{ borderColor: C.paper, color: C.paper }}>Next →</button>
          </>
        )}
      </div>
      </div>
    </div>
  );

  /* ——— read mode: recognise the meaning, or (small banks) tap to flip ——— */
  const asking = quiz && verdict === null;   // a question is open
  const faceProps = quiz
    // No tap-to-flip while a question is open: the answer is on the back.
    ? { as: "div" as const, onClick: undefined, aria: undefined }
    : { as: "button" as const, onClick: flip, aria: flipped ? "Show character" : "Reveal answer" };
  const Face = faceProps.as;

  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {header}
      <div className="relative w-full max-w-sm">
      <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
      <Face
        {...(faceProps.onClick ? { onClick: faceProps.onClick } : {})}
        {...(asking ? {} : { onTouchStart, onTouchEnd })}
        aria-label={faceProps.aria}
        className={`w-full rounded-lg px-6 flex flex-col items-center justify-center gap-4 ${
          asking ? "py-4" : "py-12"}`}
        style={{
          background: C.ink2, border: `1px solid ${C.line}`,
          // Smaller while a question is open. All four options have to sit
          // above the nav bar on a short phone, or the test becomes a
          // scavenger hunt — and the character is legible either way.
          minHeight: asking ? 108 : 300,
          cursor: quiz ? "default" : "pointer",
        }}
      >
        {!flipped ? (
          <div className="hz font-black text-center"
            style={{
              color: C.paper, lineHeight: 1.1,
              fontSize: asking
                ? (card.hanzi.length > 2 ? 48 : 64)
                : (card.hanzi.length > 2 ? 64 : 96),
            }}>
            {card.hanzi}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="hz font-semibold" style={{ color: C.dim, fontSize: 40, lineHeight: 1.1 }}>{card.hanzi}</div>
            <div className="flex items-center gap-1">
              <div className="mono text-2xl" style={{ color: C.paper }}>{card.pinyin}</div>
              <SpeakBtn text={card.hanzi} size="lg" />
            </div>
            <div className="ui text-base text-center leading-relaxed" style={{ color: C.paper }}>{card.meaning}</div>
            <div className="ui t-meta text-center" style={{ color: C.faint }}>
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
      </Face>
      </div>

      {quiz ? (
        verdict === null ? (
          /* The question. Four meanings, one of them this character's — the
             thing that turns a flashcard into evidence you can earn a dex
             slot with. Distractors share the part of speech where possible,
             so the answer is never the odd one out. */
          <div className="w-full max-w-sm flex flex-col gap-2">
            <div className="ui t-meta text-center" style={{ color: C.faint }}>
              What does it mean?
            </div>
            {options.map(option => (
              <button key={option} onClick={() => choose(option)}
                className="ui text-sm text-left px-4 py-3 rounded border leading-snug"
                style={{ borderColor: C.line, color: C.paper, background: C.ink2 }}>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="w-full max-w-sm flex flex-col items-center gap-3">
            <div className="hz font-black" aria-label={verdict === "ok" ? "correct" : "incorrect"}
              style={{ color: verdict === "ok" ? C.paper : C.cinnabar, fontSize: 40, lineHeight: 1 }}>
              {verdict === "ok" ? "✓" : "✕"}
            </div>
            {verdict === "no" && (
              <div className="ui t-meta text-center" style={{ color: C.faint }}>
                you chose <span style={{ color: C.dim }}>{picked}</span> — repeats at end of deck
              </div>
            )}
            {verdict === "ok" && proofHint && (
              <div className="ui t-meta text-center max-w-xs" style={{ color: C.faint }}>{proofHint}</div>
            )}
            <button onClick={next} className="ui px-8 py-2 t-btn border rounded"
              style={{ borderColor: C.paper, color: C.paper }}>Next →</button>
          </div>
        )
      ) : !flipped ? (
        <>
          <div className="ui t-meta" style={{ color: C.faint }}>tap to flip {"·"} swipe left/right for next/back</div>
          <div className="flex gap-3">
            <button onClick={prev} disabled={idx === 0}
              className="ui t-btn px-6 py-2 border rounded"
              style={{ borderColor: C.line, color: C.dim, opacity: idx === 0 ? 0.35 : 1 }}>
              ← Back
            </button>
            <button onClick={flip}
              className="ui t-btn px-8 py-2 border rounded"
              style={{ borderColor: C.paper, color: C.paper }}>
              Reveal
            </button>
          </div>
        </>
      ) : (
        /* Self-rating is what turns this from a page-turner into a scheduler:
           each grade sets when the character comes back. Intervals are
           previewed on the buttons so the choice is informed. */
        <div className="w-full max-w-sm flex flex-col gap-2">
          <div className="ui t-meta text-center" style={{ color: C.faint }}>
            How well did you recall it?
          </div>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map(({ grade: g, label, zh }) => (
              <button key={g} onClick={() => grade(g)}
                aria-label={`${label} — next review in ${formatInterval(previewIntervalDays(srs[card.id], g))}`}
                className="flex flex-col items-center gap-1 py-2 rounded border"
                style={{
                  borderColor: g === "good" ? C.paper : C.line,
                  color: g === "good" ? C.paper : C.dim,
                }}>
                <span className="hz text-base leading-none">{zh}</span>
                <span className="ui t-micro">{label}</span>
                <span className="ui t-micro" style={{ color: C.faint }}>
                  {formatInterval(previewIntervalDays(srs[card.id], g))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
