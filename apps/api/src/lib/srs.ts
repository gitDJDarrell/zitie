// SM-2-lite spaced repetition.
//
// Deliberately a simplified SuperMemo-2: four grades, an ease factor that
// drifts with performance, and an interval that multiplies by that ease. The
// differences from textbook SM-2 are all in service of a character-study app:
//
//  - "again" reschedules in minutes, not days, so a missed card comes back
//    inside the same session rather than tomorrow.
//  - The first two successful reps use fixed 1d/3d steps instead of the ease
//    curve, so a brand-new character gets seen again soon regardless of ease.
//  - Intervals are capped at a year; beyond that the scheduling is noise.

export type Grade = "again" | "hard" | "good" | "easy";

export interface SrsState {
  ease: number;
  intervalDays: number;
  due: Date | null;
  reps: number;
  lapses: number;
}

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 365;
const RELEARN_MINUTES = 10; // "again" comes back this soon

const DAY_MS = 24 * 60 * 60 * 1000;

function clampEase(e: number) {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, e));
}

function clampInterval(d: number) {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(0, d));
}

/** Apply a grade to a card's current scheduling state. Pure — `now` is injected. */
export function schedule(prev: SrsState, grade: Grade, now: Date = new Date()): SrsState {
  const reps = prev.reps;
  let ease = prev.ease;
  let intervalDays: number;

  switch (grade) {
    case "again":
      ease = clampEase(ease - 0.2);
      // Sub-day relearn step; the card returns inside the current session.
      intervalDays = RELEARN_MINUTES / (24 * 60);
      return {
        ease,
        intervalDays,
        due: new Date(now.getTime() + intervalDays * DAY_MS),
        reps: 0,                                  // learning restarts
        lapses: prev.lapses + (reps > 0 ? 1 : 0), // only a lapse if it had stuck before
      };

    case "hard":
      ease = clampEase(ease - 0.15);
      intervalDays = reps === 0 ? 1 : clampInterval(Math.max(1, prev.intervalDays * 1.2));
      break;

    case "good":
      // Fixed early steps, then the ease curve takes over.
      intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : clampInterval(prev.intervalDays * ease);
      break;

    case "easy":
      ease = clampEase(ease + 0.15);
      intervalDays = reps === 0 ? 3 : clampInterval(Math.max(4, prev.intervalDays * ease * 1.3));
      break;
  }

  return {
    ease,
    intervalDays,
    due: new Date(now.getTime() + intervalDays * DAY_MS),
    reps: reps + 1,
    lapses: prev.lapses,
  };
}

/** Starting state for a card that has never been graded. */
export function initialState(): SrsState {
  return { ease: 2.5, intervalDays: 0, due: null, reps: 0, lapses: 0 };
}
