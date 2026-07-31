/* ————————————————— stroke grading —————————————————
   Brush mode is the only study mode that checks *how* a character is formed
   rather than just which one it is, and that only means anything if the check
   is real. What makes it real is the medians: makemeahanzi records the
   centreline of every stroke, in written order, so a stroke someone draws can
   be matched against the one they meant to draw.

   The comparison is deliberately forgiving about shape and strict about order.
   Nobody's mouse-drawn 思 will trace a centreline closely, and demanding that
   would teach nothing; writing the box before the strokes inside it, on the
   other hand, is exactly the mistake worth catching. */

/** makemeahanzi's coordinate space: 1024 wide, y increasing upward. */
export const GLYPH_BOX = 1024;
/** How far the glyph box extends below the baseline, in the same units. */
export const GLYPH_DESCENT = 124;
/** y of the baseline in makemeahanzi's space — the box top once flipped. */
export const GLYPH_BASELINE = GLYPH_BOX - GLYPH_DESCENT; // 900

export interface CharacterStrokes {
  strokes: string[];        // SVG path per stroke, for drawing the glyph
  medians: number[][][];    // centreline points per stroke, in written order
}

export type Point = [number, number];

/**
 * Resample a polyline to exactly `n` evenly spaced points. Two strokes drawn at
 * different speeds produce wildly different point counts for the same shape,
 * and this is what makes them comparable at all.
 */
export function resample(points: Point[], n = 16): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => points[0]);

  const spans: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    spans.push(d);
    total += d;
  }
  if (total === 0) return Array.from({ length: n }, () => points[0]);

  const step = total / (n - 1);
  const out: Point[] = [points[0]];
  let seg = 0;
  let walked = 0;      // distance covered within the current segment
  for (let k = 1; k < n - 1; k++) {
    let want = step * k;
    // Walk forward until the target distance falls inside the current segment.
    let consumed = 0;
    for (let i = 0; i < seg; i++) consumed += spans[i];
    consumed += walked;
    while (seg < spans.length && consumed + (spans[seg] - walked) < want) {
      consumed += spans[seg] - walked;
      walked = 0;
      seg++;
    }
    if (seg >= spans.length) { out.push(points[points.length - 1]); continue; }
    const need = want - consumed;
    const t = spans[seg] === 0 ? 0 : (walked + need) / spans[seg];
    const a = points[seg], b = points[seg + 1];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    walked += need;
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Total path length — a stroke's "size", used to reject stray dots. */
export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/**
 * How far a drawn stroke sits from a target centreline, as a fraction of the
 * glyph box — 0 is a perfect trace, 1 is a whole glyph-width away. Compared
 * point-for-point after resampling, so it accounts for shape and position and
 * for direction: a stroke drawn right-to-left when it should go left-to-right
 * scores badly, which is correct, because that is a real error.
 */
export function strokeDistance(drawn: Point[], median: Point[]): number {
  const a = resample(drawn);
  const b = resample(median);
  if (!a.length || !b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  }
  return sum / a.length / GLYPH_BOX;
}

/** Anything past this is not a recognisable attempt at the target stroke. */
export const MATCH_TOLERANCE = 0.18;

export interface StrokeMatch {
  /** Index into the character's medians, or null when nothing matched. */
  target: number | null;
  distance: number;
}

/**
 * Which target stroke each drawn stroke was aiming at. Greedy and one-to-one:
 * the best available pairing wins, and a target already claimed can't be
 * claimed again, so drawing the same stroke twice leaves the second unmatched
 * rather than quietly counting twice.
 */
export function matchStrokes(drawn: Point[][], medians: Point[][]): StrokeMatch[] {
  const taken = new Set<number>();
  const matches: StrokeMatch[] = [];
  for (const stroke of drawn) {
    let best: StrokeMatch = { target: null, distance: 1 };
    for (let t = 0; t < medians.length; t++) {
      if (taken.has(t)) continue;
      const distance = strokeDistance(stroke, medians[t]);
      if (distance < best.distance) best = { target: t, distance };
    }
    if (best.target !== null && best.distance <= MATCH_TOLERANCE) {
      taken.add(best.target);
      matches.push(best);
    } else {
      matches.push({ target: null, distance: best.distance });
    }
  }
  return matches;
}

export interface Verdict {
  /** Every target stroke drawn, in the right order, nothing spurious. */
  perfect: boolean;
  /** Every target stroke drawn — order aside. This is what earns the proof. */
  complete: boolean;
  /** Strokes drawn out of sequence, as [expected, actual] target indices. */
  orderOk: boolean;
  matched: number;
  expected: number;
  /** Drawn strokes that matched nothing recognisable. */
  stray: number;
  /** Target strokes never drawn. */
  missing: number[];
  matches: StrokeMatch[];
}

/**
 * The whole assessment for one attempt.
 *
 * `complete` is what brush mode requires, and it deliberately ignores order:
 * getting every stroke of a character down is the achievement, and stroke order
 * is coached rather than gated — a learner who writes 思 correctly but builds
 * the box the wrong way round has still written 思. The order verdict drives
 * the "written in a different stroke order · show me" nudge instead.
 */
export function gradeAttempt(drawn: Point[][], medians: Point[][]): Verdict {
  const matches = matchStrokes(drawn, medians);
  const hit = matches.map((m) => m.target).filter((t): t is number => t !== null);
  const missing = medians.map((_, i) => i).filter((i) => !hit.includes(i));

  // Order is judged on the matched strokes alone: whether the targets they hit
  // came out in ascending sequence.
  let orderOk = true;
  for (let i = 1; i < hit.length; i++) if (hit[i] < hit[i - 1]) { orderOk = false; break; }

  const complete = medians.length > 0 && missing.length === 0;
  const stray = matches.filter((m) => m.target === null).length;
  return {
    perfect: complete && orderOk && stray === 0,
    complete,
    orderOk,
    matched: hit.length,
    expected: medians.length,
    stray,
    missing,
    matches,
  };
}

/**
 * What a handed-in brush attempt means for scheduling.
 *
 * Separated out and tested because the interesting cases are the failures, and
 * they used to be unreachable: the pad graded itself the instant the character
 * was complete, so an attempt could only ever be submitted if it was already
 * right. A wrong attempt had nowhere to go but "skip", which records nothing —
 * so the mode graded successes and quietly discarded every failure.
 *
 * - complete, right order, no strays → "good", and the brush proof is earned
 * - complete otherwise               → "hard"; the character was written, the
 *                                      execution needs work, proof still earned
 * - incomplete                       → "again", no proof, back into the deck
 * - nothing to check against         → "good" on trust, and *no* proof, because
 *                                      we cannot claim to have verified it
 */
export interface BrushOutcome {
  grade: "again" | "hard" | "good";
  /** Whether this attempt banks the brush proof toward the dex slot. */
  earnsProof: boolean;
  /** Whether the card goes back into the deck to be met again this session. */
  requeue: boolean;
  /** Whether it counts toward the session's correct tally. */
  correct: boolean;
}

export function brushOutcome(v: Verdict | null): BrushOutcome {
  if (!v) return { grade: "good", earnsProof: false, requeue: false, correct: true };
  if (!v.complete) return { grade: "again", earnsProof: false, requeue: true, correct: false };
  return { grade: v.perfect ? "good" : "hard", earnsProof: true, requeue: false, correct: true };
}

/** Points on a canvas → the glyph's coordinate space, so distances compare. */
export function toGlyphSpace(points: Point[], size: number): Point[] {
  const scale = GLYPH_BOX / size;
  // makemeahanzi's y axis points up and sits on a 900-unit baseline; canvas y
  // points down. Flip here so a stroke drawn at the top of the canvas lands at
  // the top of the glyph.
  return points.map(([x, y]) => [x * scale, GLYPH_BASELINE - y * scale]);
}

/** The inverse, for drawing the target glyph and its medians on the canvas. */
export function toCanvasSpace(points: Point[], size: number): Point[] {
  const scale = size / GLYPH_BOX;
  return points.map(([x, y]) => [x * scale, (GLYPH_BASELINE - y) * scale]);
}

/**
 * The same mapping as `toCanvasSpace`, as a canvas transform — for filling the
 * target glyph's own SVG paths, which can't be run through a point function.
 *
 * It exists so the outline and the medians cannot land in different places.
 * They did: the transform was written out by hand as
 *   translate(0, size) · scale(s, -s) · translate(0, -124)
 * and that last step runs *after* the y flip, so the descent was applied
 * upward — putting the traceable outline 248 units (a quarter of the pad)
 * below the strokes being graded. Tracing what you could see then scored 0.242
 * against a 0.18 tolerance, so every stroke came back "unrecognised".
 *
 * Apply as: ctx.translate(0, ty); ctx.scale(sx, sy).
 */
export function glyphCanvasTransform(size: number): { ty: number; sx: number; sy: number } {
  const scale = size / GLYPH_BOX;
  return { ty: GLYPH_BASELINE * scale, sx: scale, sy: -scale };
}

/**
 * One verdict for a whole word, from the per-character attempts.
 *
 * A word is written a character at a time — 咖啡 is 咖 then 啡 — and the card's
 * proof is the whole word, so the weakest character sets the result. Anything
 * else would let someone earn 咖啡 by writing 咖 and giving up.
 *
 * A character with no stroke geometry contributes a null verdict. Those are
 * skipped rather than counted as failures: the pad had nothing to grade them
 * against, and holding that against the learner would punish them for a gap in
 * the dataset. A word made entirely of such characters returns null, which
 * `brushOutcome` already treats as ungradeable.
 */
export function combineVerdicts(parts: (Verdict | null)[]): Verdict | null {
  const graded = parts.filter((v): v is Verdict => v !== null);
  if (!graded.length) return null;

  return {
    perfect: graded.every((v) => v.perfect),
    complete: graded.every((v) => v.complete),
    orderOk: graded.every((v) => v.orderOk),
    matched: graded.reduce((n, v) => n + v.matched, 0),
    expected: graded.reduce((n, v) => n + v.expected, 0),
    stray: graded.reduce((n, v) => n + v.stray, 0),
    // Indices are per character and don't compose into one list; the count is
    // what the summary needs, and expected − matched gives it.
    missing: [],
    matches: graded.flatMap((v) => v.matches),
  };
}
