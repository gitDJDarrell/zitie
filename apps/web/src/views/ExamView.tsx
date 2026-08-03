import { useEffect, useMemo, useRef, useState } from "react";
import { SpeakBtn, StarBtn } from "../components/atoms";
import { BrushPad } from "../components/BrushPad";
import { DEFAULT_INK } from "../lib/ink";
import { checkAnswer } from "../lib/answer";
import { CHOICE_COUNT, isAnswer, meaningChoices } from "../lib/choices";
import { combineVerdicts, type Verdict } from "../lib/strokes";
import { useStrokeSet } from "../lib/useStrokes";
import { canExam, isDue, MASTERY_MARKS, masteryMarks, PROOF_GLYPH } from "../lib/srs";
import { speak } from "../lib/speech";
import { C } from "../theme";
import type { Card, Grade, Proof, SeenMap } from "../types";

/* ————————————————— 考 the exam — the final boss —————————————————
   Collection asks you to produce a character three ways with the study screen
   holding your hand. The exam takes the hand away. A collected, due card is
   sat strict in each direction it hasn't yet mastered:

     认 recognise it — from five meanings, not four, and with no second guess
     写 write it     — the characters only; the reading is not a pass here
     描 brush it     — no numbered order, no tracing, no "show me", and every
                        stroke in the taught sequence, or it doesn't count

   A clean pass banks one mark. MASTERY_MARKS of each — earned across separate
   sittings, because a pass reschedules the card out of the due pool — is
   mastery, and mastery is the shiny. This screen is deliberately its own place,
   not a mode of Study: an exam should feel like one. */

export interface ExamSession {
  nonce: number;
}

/** One thing to prove: a single direction of a single card. */
interface Trial {
  cardId: string;
  dir: Proof;
}

const DIR_ORDER: Proof[] = ["read", "write", "brush"];
const DIR_LABEL: Record<Proof, { zh: string; name: string; verb: string }> = {
  read: { zh: "认", name: "recognise", verb: "pick its meaning" },
  write: { zh: "写", name: "write", verb: "type the characters" },
  brush: { zh: "描", name: "brush", verb: "write it by hand" },
};

/** Everything still owed on a card, in read→write→brush order. */
function trialsFor(rec: SeenMap[string]): Proof[] {
  const m = masteryMarks(rec);
  return DIR_ORDER.filter(d => m[d] < MASTERY_MARKS);
}

export function ExamView({ bank, srs, onGrade, onToggleStar, onExit, onSessionActive }: {
  bank: Card[]; srs: SeenMap;
  onGrade: (id: string, grade: Grade, proof?: Proof, exam?: boolean) => void;
  onToggleStar: (id: string) => void;
  onExit: () => void;
  onSessionActive?: (active: boolean) => void;
}) {
  const byId = useMemo(() => new Map(bank.map(c => [c.id, c])), [bank]);

  // The eligible pool, snapshotted when the exam is entered — a card that
  // reschedules mid-sitting shouldn't vanish from the queue under you, and a
  // mark banked now shouldn't drop its own remaining trials. Cards that are
  // collected, due, and not yet mastered; each with the directions it still
  // owes. Frozen at mount via the ref below.
  const initialTrials = useMemo(() => {
    const out: Trial[] = [];
    for (const card of bank) {
      const rec = srs[card.id];
      if (!canExam(rec) || !isDue(rec)) continue;
      for (const dir of trialsFor(rec)) out.push({ cardId: card.id, dir });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [queue] = useState<Trial[]>(initialTrials);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState({ pass: 0, fail: 0 });

  const inSession = started && idx < queue.length;
  useEffect(() => {
    onSessionActive?.(inSession);
    return () => onSessionActive?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSession]);

  const trial = started ? queue[idx] : undefined;
  const card = trial ? byId.get(trial.cardId) : undefined;

  const distinctCards = useMemo(
    () => new Set(queue.map(t => t.cardId)).size,
    [queue],
  );

  if (!started) {
    return (
      <ExamGate count={queue.length} cards={distinctCards} onExit={onExit}
        onBegin={() => { setStarted(true); setIdx(0); setScore({ pass: 0, fail: 0 }); }} />
    );
  }

  if (!card) {
    const total = score.pass + score.fail;
    return (
      <div className="flex flex-col items-center gap-4 pt-16">
        <div className="hz text-5xl" style={{ color: C.paper }}>考毕</div>
        <p className="ui text-sm text-center max-w-xs" style={{ color: C.dim }}>
          {total > 0
            ? <>Exam over — <span style={{ color: C.paper }}>{score.pass}</span> marks banked{score.fail > 0 && <> · {score.fail} came up short</>}.</>
            : <>Nothing to sit right now.</>}
        </p>
        <p className="ui t-meta text-center max-w-xs" style={{ color: C.faint }}>
          Marks carry over. A mastered card needs {MASTERY_MARKS} clean passes in each
          direction, earned across separate sittings — come back when these are due again.
        </p>
        <button onClick={onExit} className="ui px-6 py-2 t-btn border rounded"
          style={{ borderColor: C.paper, color: C.paper }}>
          Back
        </button>
      </div>
    );
  }

  function advance(passed: boolean) {
    setScore(s => passed ? { ...s, pass: s.pass + 1 } : { ...s, fail: s.fail + 1 });
    setIdx(i => i + 1);
  }

  return (
    <ExamTrial
      key={`${trial!.cardId}:${trial!.dir}:${idx}`}
      card={card} rec={srs[card.id]} trial={trial!} bank={bank}
      position={{ index: idx + 1, total: queue.length }}
      score={score}
      onToggleStar={onToggleStar}
      onGrade={onGrade}
      onDone={advance}
      onQuit={onExit}
    />
  );
}

/* ——— the start screen: what the exam is, and who's eligible ——— */
function ExamGate({ count, cards, onBegin, onExit }: {
  count: number; cards: number; onBegin: () => void; onExit: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 pt-10">
      <div className="flex flex-col items-center gap-2">
        <div className="hz text-5xl font-black" style={{ color: C.paper }}>考</div>
        <div className="ui t-label" style={{ color: C.faint }}>the exam</div>
      </div>
      <p className="ui t-body text-center max-w-xs" style={{ color: C.dim }}>
        The final bar. Collected cards, tested strict and unassisted in each
        direction — no options to lean on, no reading in place of the characters,
        no stroke order under the brush. Clear all three enough times and the
        card turns shiny.
      </p>
      <div className="flex flex-col items-center gap-1">
        <div className="ui t-meta text-center" style={{ color: C.dim }}>
          {count > 0
            ? <><span style={{ color: C.paper }}>{count}</span> trial{count === 1 ? "" : "s"} ready · <span style={{ color: C.paper }}>{cards}</span> card{cards === 1 ? "" : "s"} due</>
            : <>Nothing is due for examination yet.</>}
        </div>
        {count === 0 && (
          <div className="ui t-micro text-center max-w-xs" style={{ color: C.faint }}>
            Collect a character all three ways first, then let it come due — the
            exam only sits cards you've already earned.
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={onBegin} disabled={!count}
          className="ui t-btn px-6 py-3 border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: count ? 1 : 0.35 }}>
          Begin
        </button>
        <button onClick={onExit} className="ui t-btn px-6 py-3 border rounded"
          style={{ borderColor: C.line, color: C.dim }}>
          Not yet
        </button>
      </div>
    </div>
  );
}

/* ——— one trial: strict, single-shot, one direction ——— */
function ExamTrial({ card, rec, trial, bank, position, score, onGrade, onToggleStar, onDone, onQuit }: {
  card: Card; rec: SeenMap[string]; trial: Trial; bank: Card[];
  position: { index: number; total: number };
  score: { pass: number; fail: number };
  onGrade: (id: string, grade: Grade, proof?: Proof, exam?: boolean) => void;
  onToggleStar: (id: string) => void;
  onDone: (passed: boolean) => void;
  onQuit: () => void;
}) {
  const dir = trial.dir;
  const marks = masteryMarks(rec);

  const header = (
    <div className="w-full max-w-sm flex flex-col gap-2">
      <div className="flex justify-between ui t-label">
        <button onClick={onQuit} className="px-1 py-1" style={{ color: C.faint }}>
          {"✕"} leave exam
        </button>
        <span style={{ color: C.faint }}>
          <span style={{ color: C.paper }}>✓ {score.pass}</span>
          {score.fail > 0 && <span style={{ color: C.cinnabar }}> · ✕ {score.fail}</span>}
        </span>
      </div>
      <div className="flex items-baseline justify-between ui text-xs tracking-wide" style={{ color: C.faint }}>
        <span>trial {position.index} of {position.total}</span>
        <span className="hz">
          {PROOF_GLYPH.map(g => (
            <span key={g.key} style={{ color: g.key === dir ? C.cinnabar : marks[g.key] >= MASTERY_MARKS ? C.paper : C.ink3 }}>
              {g.zh}
            </span>
          ))}
        </span>
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.ink3 }} aria-hidden="true">
        <div className="h-full rounded-full"
          style={{ width: `${Math.round((position.index - 1) / position.total * 100)}%`, background: C.cinnabar, transition: "width 300ms ease" }} />
      </div>
      <div className="ui t-micro text-center" style={{ color: C.faint }}>
        考 {DIR_LABEL[dir].zh} {DIR_LABEL[dir].name} · mark {Math.min(marks[dir] + 1, MASTERY_MARKS)} of {MASTERY_MARKS}
      </div>
    </div>
  );

  if (dir === "read") return <ReadTrial card={card} bank={bank} header={header} onGrade={onGrade} onDone={onDone} onToggleStar={onToggleStar} />;
  if (dir === "write") return <WriteTrial card={card} header={header} onGrade={onGrade} onDone={onDone} onToggleStar={onToggleStar} />;
  return <BrushTrial card={card} header={header} onGrade={onGrade} onDone={onDone} onToggleStar={onToggleStar} />;
}

/* ——— 认 recognise: five meanings, one shot ——— */
function ReadTrial({ card, bank, header, onGrade, onDone, onToggleStar }: {
  card: Card; bank: Card[]; header: React.ReactNode;
  onGrade: (id: string, grade: Grade, proof?: Proof, exam?: boolean) => void;
  onDone: (passed: boolean) => void;
  onToggleStar: (id: string) => void;
}) {
  // Five options where the bank can field them — a harder draw than study's
  // four — falling back to four, then to a bare pass only if the bank is tiny.
  const options = useMemo(() => {
    const five = meaningChoices(card, bank, Math.min(CHOICE_COUNT + 1, bank.length));
    return five.length ? five : meaningChoices(card, bank, CHOICE_COUNT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);
  const [picked, setPicked] = useState<string | null>(null);

  function choose(option: string) {
    if (picked !== null) return;
    const ok = isAnswer(option, card);
    setPicked(option);
    onGrade(card.id, ok ? "good" : "again", ok ? "read" : undefined, true);
  }

  const answered = picked !== null;
  const right = picked !== null && isAnswer(picked, card);

  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {header}
      <div className="relative w-full max-w-sm rounded-lg px-6 py-8 flex flex-col items-center gap-2"
        style={{ background: C.ink2, border: `1px solid ${C.line}` }}>
        <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
        <div className="hz font-black text-center" style={{ color: C.paper, fontSize: card.hanzi.length > 2 ? 56 : 76, lineHeight: 1.1 }}>
          {card.hanzi}
        </div>
      </div>
      {!answered ? (
        <div className="w-full max-w-sm flex flex-col gap-2">
          <div className="ui t-meta text-center" style={{ color: C.faint }}>What does it mean?</div>
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
          <div className="w-full flex flex-col gap-2" aria-hidden="true">
            {options.map(option => {
              const correct = isAnswer(option, card);
              const wasPick = option === picked;
              return (
                <div key={option} className="ui text-sm text-left px-4 py-3 rounded border leading-snug"
                  style={{
                    borderColor: correct ? C.paper : wasPick ? C.cinnabar : C.ink3,
                    color: correct ? C.paper : wasPick ? C.cinnabar : C.faint,
                    background: correct ? C.ink2 : "transparent",
                  }}>
                  {correct ? "✓ " : wasPick ? "✕ " : ""}{option}
                </div>
              );
            })}
          </div>
          <Outcome right={right} card={card} passText="mark banked" failText="no mark — comes back due" />
          <NextButton onClick={() => onDone(right)} />
        </div>
      )}
    </div>
  );
}

/* ——— 写 write: the characters only ——— */
function WriteTrial({ card, header, onGrade, onDone, onToggleStar }: {
  card: Card; header: React.ReactNode;
  onGrade: (id: string, grade: Grade, proof?: Proof, exam?: boolean) => void;
  onDone: (passed: boolean) => void;
  onToggleStar: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [right, setRight] = useState(false);

  function check() {
    if (!input.trim() || done) return;
    // Strict: only the characters count. In study, the reading is accepted as a
    // step toward it — the exam is the step itself, so pinyin is not a pass.
    const kind = checkAnswer(input, card);
    const ok = kind === "hanzi";
    setRight(ok); setDone(true);
    onGrade(card.id, ok ? "good" : "again", ok ? "write" : undefined, true);
  }

  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {header}
      <div className="relative w-full max-w-sm rounded-lg px-6 py-10 flex flex-col items-center justify-center gap-5"
        style={{ background: C.ink2, border: `1px solid ${C.line}`, minHeight: 300 }}>
        <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
        {!done ? (
          <>
            <div className="ui text-2xl text-center leading-snug" style={{ color: C.paper }}>{card.meaning}</div>
            <div className="ui t-meta" style={{ color: C.faint }}>
              {card.pos.join(" · ")}{card.compound ? " · compound" : ""}
            </div>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") check(); }}
              placeholder="the characters" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="hz w-full px-4 py-3 text-2xl text-center rounded border bg-transparent"
              style={{ borderColor: C.line, color: C.paper }} />
            <button onClick={check} disabled={!input.trim()}
              className="ui px-8 py-2 t-btn border rounded"
              style={{ borderColor: C.paper, color: C.paper, opacity: input.trim() ? 1 : 0.35 }}>
              Hand in
            </button>
          </>
        ) : (
          <>
            <div className="hz font-black" aria-label={right ? "correct" : "incorrect"}
              style={{ color: right ? C.paper : C.cinnabar, fontSize: 56, lineHeight: 1 }}>
              {right ? "✓" : "✕"}
            </div>
            {!right && (
              <div className="ui t-meta text-center" style={{ color: C.faint }}>
                you wrote <span className="hz text-base" style={{ color: C.dim }}>{input.trim() || "—"}</span>
                {checkAnswer(input, card) === "pinyin" && <> — the reading isn't a pass in the exam</>}
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className="hz font-black" style={{ color: C.paper, fontSize: 64, lineHeight: 1.1 }}>{card.hanzi}</div>
              <div className="flex items-center gap-1">
                <div className="mono text-lg" style={{ color: C.paper }}>{card.pinyin}</div>
                <SpeakBtn text={card.hanzi} />
              </div>
              <div className="ui text-sm text-center" style={{ color: C.dim }}>{card.meaning}</div>
            </div>
            <Outcome right={right} card={card} passText="mark banked" failText="no mark — comes back due" />
            <NextButton onClick={() => onDone(right)} />
          </>
        )}
      </div>
    </div>
  );
}

/* ——— 描 brush: by hand, no help, taught order required ——— */
function BrushTrial({ card, header, onGrade, onDone, onToggleStar }: {
  card: Card; header: React.ReactNode;
  onGrade: (id: string, grade: Grade, proof?: Proof, exam?: boolean) => void;
  onDone: (passed: boolean) => void;
  onToggleStar: (id: string) => void;
}) {
  const strokeSet = useStrokeSet(card.hanzi);
  const chars = [...card.hanzi];
  const [charIndex, setCharIndex] = useState(0);
  const [charVerdicts, setCharVerdicts] = useState<(Verdict | null)[]>([]);
  const [done, setDone] = useState(false);
  const [whole, setWhole] = useState<Verdict | null>(null);
  const active = strokeSet[charIndex] ?? null;

  // Strict pass = perfect: every stroke, in the taught order, nothing spurious.
  // Study's brush accepts a different order; the exam does not.
  const passed = !!whole?.perfect;

  function submit(v: Verdict | null) {
    if (done) return;
    const collected = [...charVerdicts, v];
    setCharVerdicts(collected);
    if (charIndex < strokeSet.length - 1) {
      setCharIndex(charIndex + 1);
      return;
    }
    const combined = combineVerdicts(collected);
    setWhole(combined);
    setDone(true);
    const ok = !!combined?.perfect;
    onGrade(card.id, ok ? "good" : "again", ok ? "brush" : undefined, true);
    speak(card.hanzi);
  }

  return (
    <div className="flex flex-col items-center gap-3 pt-3"
      style={{
        width: "100vw", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
      }}>
      <div className="w-full flex justify-center">{header}</div>

      <div className="relative w-full flex flex-col items-center gap-1">
        <div className="ui text-lg text-center leading-snug px-8" style={{ color: C.paper }}>{card.meaning}</div>
        {/* No pinyin, no character on screen: the exam gives you the meaning and
            nothing else to copy from. */}
        {chars.length > 1 && !done && (
          <div className="flex items-center gap-1 pt-1">
            {chars.map((_, i) => (
              <span key={i} className="hz text-lg leading-none px-1"
                style={{ color: i < charIndex ? C.paper : i === charIndex ? C.cinnabar : C.ink3 }}>
                {i < charIndex ? "✓" : "•"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="w-full flex justify-center">
        <div className="w-full" style={{ maxWidth: 440 }}>
          <BrushPad
            key={`${card.id}:${charIndex}`}
            hanzi={chars[charIndex] ?? card.hanzi}
            target={active?.data ?? null}
            ink={DEFAULT_INK}
            surface="plain"
            mode="write"
            showStrokeOrder={false}
            allowShowMe={false}
            onSubmit={submit}
            submitted={done}
            step={{ index: charIndex + 1, total: chars.length }}
          />
        </div>
      </div>

      {done && (
        <div className="w-full flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="hz font-black" style={{ color: C.paper, fontSize: 44, lineHeight: 1.1 }}>{card.hanzi}</div>
            <div className="flex items-center gap-1">
              <div className="mono text-base" style={{ color: C.paper }}>{card.pinyin}</div>
              <SpeakBtn text={card.hanzi} />
              <StarBtn starred={!!card.starred} onClick={() => onToggleStar(card.id)} />
            </div>
          </div>
          <div className="ui t-meta text-center max-w-xs" style={{ color: passed ? C.paper : C.cinnabar }}>
            {passed
              ? "written as taught — mark banked"
              : whole?.complete
                ? "every stroke down, but not in the taught order — the exam needs the sequence too"
                : "not every stroke — no mark, comes back due"}
          </div>
          <NextButton onClick={() => onDone(passed)} />
        </div>
      )}
    </div>
  );
}

function Outcome({ right, card, passText, failText }: {
  right: boolean; card: Card; passText: string; failText: string;
}) {
  return (
    <div className="ui t-meta text-center max-w-xs" style={{ color: right ? C.paper : C.cinnabar }}>
      {right ? passText : failText}
      {!right && <span style={{ color: C.faint }}> · {card.pinyin} · {card.meaning}</span>}
    </div>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="ui px-8 py-2 t-btn border rounded"
      style={{ borderColor: C.paper, color: C.paper }}>
      Next →
    </button>
  );
}
