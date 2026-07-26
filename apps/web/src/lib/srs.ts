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

export const MASTERY_MAX = 4;

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
export function masteryOf(rec: SeenRecord | undefined): number {
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

/** Short label for a mastery level, for tooltips and screen readers. */
export function masteryLabel(level: number): string {
  return ["new", "learning", "familiar", "strong", "mastered"][level] ?? "new";
}

/** Single-glyph shorthand for a grade, matching the study buttons. */
export const GRADE_GLYPH: Record<Grade, string> = {
  again: "忘", hard: "难", good: "好", easy: "易",
};
