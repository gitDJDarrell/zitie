import type { Card, Grade, SeenMap, SeenRecord } from "../types";

export type { Grade };

// Client-side mirror of the server's SM-2-lite scheduler (apps/api/src/lib/srs.ts).
// Used only to *preview* what each grade would do, so the buttons can be
// labelled "good · 3d" before you press them. The server stays authoritative:
// it recomputes the real schedule on POST /seen/grade and returns the truth.

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 365;
const RELEARN_MINUTES = 10;

function clampEase(e: number) { return Math.min(MAX_EASE, Math.max(MIN_EASE, e)); }
function clampInterval(d: number) { return Math.min(MAX_INTERVAL_DAYS, Math.max(0, d)); }

/** Days until the card would next be due if graded this way. */
export function previewIntervalDays(rec: SeenRecord | undefined, grade: Grade): number {
  const reps = rec?.reps ?? 0;
  const ease = rec?.ease ?? 2.5;
  const intervalDays = rec?.intervalDays ?? 0;

  switch (grade) {
    case "again": return RELEARN_MINUTES / (24 * 60);
    case "hard": return reps === 0 ? 1 : clampInterval(Math.max(1, intervalDays * 1.2));
    case "good": return reps === 0 ? 1 : reps === 1 ? 3 : clampInterval(intervalDays * ease);
    case "easy": return reps === 0 ? 3 : clampInterval(Math.max(4, intervalDays * clampEase(ease + 0.15) * 1.3));
  }
}

/** Compact human label for an interval: "10m", "1d", "3w", "5mo". */
export function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 21) return `${Math.round(days)}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(days < 730 ? 1 : 0)}y`;
}

/** Has this card come up for review? Never-graded cards are always due. */
export function isDue(rec: SeenRecord | undefined, now = Date.now()): boolean {
  if (!rec || rec.due == null) return true;
  return rec.due <= now;
}

/** A card that's been graded at least once and isn't due yet. */
export function isScheduled(rec: SeenRecord | undefined): boolean {
  return !!rec && (rec.reps ?? 0) > 0 && rec.due != null;
}

/**
 * Session ordering: overdue first (most overdue leads), then never-studied,
 * then everything else by soonest due. This is what makes a session feel like
 * a tutor rather than a deck — the cards you're about to forget come first.
 */
export function bySrsPriority(srs: SeenMap, now = Date.now()) {
  return (a: Card, b: Card): number => {
    const ra = srs[a.id];
    const rb = srs[b.id];
    return rank(ra, now) - rank(rb, now);
  };
}

// Lower sorts earlier. Overdue cards rank by how overdue (negative, so the
// most overdue leads); unseen cards sit just after them; scheduled-but-not-due
// cards trail, ordered by how soon they come up.
function rank(rec: SeenRecord | undefined, now: number): number {
  if (!rec) return 0;                      // never seen — high priority
  if (rec.due == null) return -1;          // seen but never graded — highest
  const overdueDays = (now - rec.due) / (24 * 60 * 60 * 1000);
  return overdueDays >= 0 ? -1000 - overdueDays : 1000 + (-overdueDays);
}

/** How many of these cards are due for review right now. */
export function countDue(cards: Card[], srs: SeenMap, now = Date.now()): number {
  return cards.filter(c => isDue(srs[c.id], now)).length;
}

/* ————————————————— rating readouts ————————————————— */

export const STRENGTH_MAX = 4;

/**
 * How well the card is known, 0–4, derived from the schedule rather than the
 * last button pressed — a card you rated "good" once is not as solid as one
 * you've held at a 3-month interval, and this is the number that says so.
 *
 * Driven by the current interval, since that is precisely the scheduler's own
 * estimate of how long the memory lasts. Ease and lapses only pull it down:
 * a card you keep forgetting shouldn't read as mastered just because its
 * interval crept up.
 */
export function strengthOf(rec: SeenRecord | undefined): number {
  if (!rec || !(rec.reps ?? 0)) return 0; // never graded — no evidence either way

  const days = rec.intervalDays ?? 0;
  let level =
    days >= 90 ? 4 :
    days >= 21 ? 3 :
    days >= 7 ? 2 :
    days >= 1 ? 1 : 0;

  // A low ease means it keeps needing help; repeated lapses mean it keeps
  // being forgotten outright. Either caps how "known" it can claim to be.
  if ((rec.ease ?? 2.5) <= 1.6) level = Math.min(level, 2);
  if ((rec.lapses ?? 0) >= 3) level = Math.min(level, 2);

  return level;
}

/* ————————————————— collection ————————————————— */

/**
 * The three things you can prove about a character:
 *   认 recognised — the meaning picked from the character (read mode)
 *   写 written    — the character or its reading given from the English
 *   描 brushed    — drawn by hand, every stroke of it
 *
 * They are not equals. Zitie is for reading Chinese in the wild, so 认 is the
 * one that earns the dex slot and the other two are depth on top of it. See
 * isCollected.
 *
 * All three are deliberately one-way, and deliberately not `strengthOf`.
 * Strength is the scheduler's running estimate of how well a memory is holding
 * and it moves both directions; a proof records that you did once actually do
 * the thing, and a slot you earned should not empty because you missed a
 * review three weeks later.
 */
export interface Proofs { read: boolean; write: boolean; brush: boolean }

export const PROOF_COUNT = 3;

export function proofsOf(rec: SeenRecord | undefined): Proofs {
  return { read: !!rec?.readOk, write: !!rec?.writeOk, brush: !!rec?.brushOk };
}

/**
 * Earned the dex slot: you can read it.
 *
 * This used to want all three proofs, and that quietly made the headline
 * number on the gallery a measure of handwriting. Someone who could recognise
 * 800 characters and hand-write 40 was told they had collected 40 — their
 * weakest and, for reading Chinese in the wild, least transferable skill,
 * reported as if it were their progress.
 *
 * Zitie is for reading Chinese you meet in the world, so the slot is earned by
 * recognising the character. Producing it — typing it, brushing it — is real
 * and still tracked, but as depth on top of a slot you already hold, not as a
 * gate in front of it. Breadth is the goal; gating breadth behind the hardest
 * skill is how you end up with a beautiful dex and forty characters in it.
 */
export function isCollected(rec: SeenRecord | undefined): boolean {
  return proofsOf(rec).read;
}

/** Produced it at least one way — the rung above recognising it. */
export function hasProduced(rec: SeenRecord | undefined): boolean {
  const { write, brush } = proofsOf(rec);
  return write || brush;
}

/**
 * Every proof in, the easy way. Not the dex slot any more — this is the
 * readiness bar for the 考 exam, which tests all three directions strictly and
 * would be unfair on a direction you have never once produced.
 */
export function isFullyProven(rec: SeenRecord | undefined): boolean {
  const { read, write, brush } = proofsOf(rec);
  return read && write && brush;
}

/** The glyph for each proof, in the order the modes appear in Study. */
export const PROOF_GLYPH: { key: keyof Proofs; zh: string; label: string }[] = [
  { key: "read", zh: "认", label: "recognised" },
  { key: "write", zh: "写", label: "written" },
  { key: "brush", zh: "描", label: "brushed" },
];

/** In your bank but not yet recognised — the state the dex nudges you to finish. */
export function inProgress(rec: SeenRecord | undefined): boolean {
  return !isCollected(rec);
}

/** How many of the three proofs are in, for a progress readout. */
export function proofCount(rec: SeenRecord | undefined): number {
  const { read, write, brush } = proofsOf(rec);
  return (read ? 1 : 0) + (write ? 1 : 0) + (brush ? 1 : 0);
}

/** Short label for a mastery level, for tooltips and screen readers. */
export function strengthLabel(level: number): string {
  return ["new", "learning", "familiar", "strong", "mastered"][level] ?? "new";
}

/* ————————————————— mastery (the 考 exam) ————————————————— */

/**
 * The bar above collection. Collecting a character proves you can produce it,
 * once, each of the three ways — with the help the study screen gives you.
 * Mastery is the same three ways proven *strict*: the 考 exam sits a collected
 * card with none of that help — no options to lean on, no pinyin, no stroke
 * numbers or trace under the brush — and a clean pass banks one mark. This many
 * of each is mastery, and mastery is what turns the card shiny.
 *
 * Kept as marks-per-direction, not a single counter, so the exam has to test
 * every skill: you can't brush your way to a shiny you can't read. Mirrors the
 * server's MASTERY_MARKS (apps/api/src/lib/srs.ts) — the server is
 * authoritative and caps each direction there.
 */
export const MASTERY_MARKS = 3;

export interface MasteryMarks { read: number; write: number; brush: number }

export function masteryMarks(rec: SeenRecord | undefined): MasteryMarks {
  return {
    read: Math.min(MASTERY_MARKS, rec?.readMarks ?? 0),
    write: Math.min(MASTERY_MARKS, rec?.writeMarks ?? 0),
    brush: Math.min(MASTERY_MARKS, rec?.brushMarks ?? 0),
  };
}

/** Full marks in every direction — the character is mastered, and shiny. */
export function isMastered(rec: SeenRecord | undefined): boolean {
  const m = masteryMarks(rec);
  return m.read >= MASTERY_MARKS && m.write >= MASTERY_MARKS && m.brush >= MASTERY_MARKS;
}

/** Total marks banked toward mastery, out of MASTERY_MARKS × 3. */
export function masteryProgress(rec: SeenRecord | undefined): number {
  const m = masteryMarks(rec);
  return m.read + m.write + m.brush;
}

export const MASTERY_TOTAL = MASTERY_MARKS * PROOF_COUNT;

/**
 * Eligible to sit the exam: proven every direction the easy way (there's
 * nothing to be strict about until you've produced it with help) and not
 * already mastered. Whether it's *due* is a scheduling question the caller
 * layers on top.
 */
export function canExam(rec: SeenRecord | undefined): boolean {
  return isFullyProven(rec) && !isMastered(rec);
}

/** Single-glyph shorthand for a grade, matching the study buttons. */
export const GRADE_GLYPH: Record<Grade, string> = {
  again: "忘", hard: "难", good: "好", easy: "易",
};
