// The 考 exam's Elo rating — the number under the 科举 rank titles.
//
// Every strict exam trial is scored like a chess game against a fixed-strength
// opponent: a clean pass is a win, a miss is a loss, and the rating moves by the
// standard Elo update, K-factored. Because the opponent is fixed, your rating
// converges on your true strict-recall strength — passing easy directions when
// you're already highly rated barely moves it, and missing does real damage.
//
// The three directions are not equally hard, so each has its own opponent
// rating; a brush pass is worth more than a read pass. A miss (we don't learn
// which direction from the wire — `proof` only rides along on a pass) is scored
// against a neutral opponent. Server-authoritative: only POST /seen/grade writes
// it, and only on exam trials.

export const RATING_BASE = 1000;   // everyone starts here
export const RATING_FLOOR = 100;   // a rating never sinks below this
const K = 24;                      // how far one trial can move the needle

/** Opponent strength per direction — brush is the hardest to clear strict. */
export const DIR_OPPONENT: Record<"read" | "write" | "brush", number> = {
  read: 1000,
  write: 1120,
  brush: 1280,
};
// A miss arrives without its direction, so it's scored against the middle.
export const NEUTRAL_OPPONENT = 1120;

/** Standard Elo expected score for `rating` facing `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/**
 * The rating after one trial. `opponent` is the direction's strength (or the
 * neutral value for a miss); `won` is whether it was a clean pass. Rounded to an
 * integer and floored, so it stays a tidy, bounded number.
 */
export function nextRating(rating: number, opponent: number, won: boolean): number {
  const expected = expectedScore(rating, opponent);
  const updated = rating + K * ((won ? 1 : 0) - expected);
  return Math.max(RATING_FLOOR, Math.round(updated));
}
