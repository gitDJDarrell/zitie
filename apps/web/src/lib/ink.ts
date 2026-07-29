/* ————————————————— the brush —————————————————
   A stroke is kept as the points and timings it was drawn with, never as
   pixels. Everything below turns that record into ink at render time, which is
   what lets the ink controls restyle writing that already exists: change
   wetness and the same gesture comes out of a wetter brush.

   None of this touches a canvas — it produces geometry and numbers, so the
   parts worth being sure about can be tested without a browser. */

export interface InkParams {
  /** Overall thickness, 0–1. */
  weight: number;
  /** How much the ink spreads into the paper, 0–1. */
  wetness: number;
  /** How strongly speed thins the line, 0–1. */
  speed: number;
  /** 0 = expressive and uneven, 1 = controlled and regular. */
  formality: number;
  /** Seeds every random choice, so a given hand is reproducible. */
  seed: number;
}

export const DEFAULT_INK: InkParams = {
  weight: 0.55, wetness: 0.42, speed: 0.38, formality: 0.88, seed: 7,
};

export interface SamplePoint {
  x: number;
  y: number;
  /** Milliseconds since the stroke began. */
  t: number;
}

/**
 * Deterministic PRNG (mulberry32). The brush needs randomness — bristles don't
 * splay identically twice — but it has to be the same randomness every render,
 * or the character would crawl while you drag a slider.
 */
export function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Speed in px/ms at each sample, smoothed — raw pointer deltas are spiky. */
export function speedProfile(points: SamplePoint[]): number[] {
  if (points.length < 2) return points.map(() => 0);
  const raw = points.map((p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1];
    const dt = Math.max(1, p.t - prev.t);
    return Math.hypot(p.x - prev.x, p.y - prev.y) / dt;
  });
  raw[0] = raw[1] ?? 0;
  // Three-point mean: enough to stop a single jittery sample pinching the line.
  return raw.map((_, i) => {
    const a = raw[Math.max(0, i - 1)], b = raw[i], c = raw[Math.min(raw.length - 1, i + 1)];
    return (a + b + c) / 3;
  });
}

/**
 * Half-width at every sample, in px.
 *
 * Three things shape it. A real brush thins as it moves faster, so speed
 * reduces width by up to `speed`. It also lands and lifts, so both ends taper —
 * gently at the start where the brush is pressed down, sharply at the end where
 * it is drawn away. And `formality` flattens all of it: a formal hand is
 * regular, a loose one lets the line breathe.
 */
export function widthProfile(points: SamplePoint[], ink: InkParams, scale: number): number[] {
  // Tuned against a 384px pad: at the default weight a stroke is ~15px wide,
  // which leaves an eight-stroke character legible rather than filled in. The
  // old range was more than twice this and swallowed anything busier than 水.
  const base = (0.008 + 0.022 * ink.weight) * scale;
  const speeds = speedProfile(points);
  const fastest = Math.max(0.15, ...speeds);
  const random = rng(ink.seed);
  // A loose hand wanders; a formal one doesn't. Precomputed per sample so the
  // wander is stable across renders.
  const wander = points.map(() => 1 + (random() - 0.5) * 0.5 * (1 - ink.formality));

  return points.map((_, i) => {
    const fraction = points.length > 1 ? i / (points.length - 1) : 0;
    const thinning = 1 - ink.speed * 0.75 * (speeds[i] / fastest);
    // Landing: quick ramp over the first tenth. Lifting: long taper over the
    // last quarter, which is where a brush leaves its characteristic point.
    const landing = Math.min(1, fraction / 0.1 + 0.35);
    const lifting = fraction < 0.75 ? 1 : 1 - ((fraction - 0.75) / 0.25) ** 1.6 * 0.8;
    const ends = Math.min(landing, lifting);
    const shaped = base * thinning * ends * wander[i];
    return Math.max(base * 0.12, shaped);
  });
}

/** Unit normal at each sample, for offsetting the centreline into an outline. */
function normals(points: SamplePoint[]): [number, number][] {
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
}

/**
 * The stroke as a closed outline: down one side of the centreline and back up
 * the other. Filling this rather than stroking a line is what allows the width
 * to vary along the stroke, which is the whole character of a brush.
 */
export function strokeOutline(points: SamplePoint[], widths: number[]): [number, number][] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    // A tap — a round dot, which is what a brush set down and lifted leaves.
    const r = widths[0];
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return [points[0].x + Math.cos(a) * r, points[0].y + Math.sin(a) * r] as [number, number];
    });
  }
  const n = normals(points);
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  points.forEach((p, i) => {
    const w = widths[i];
    left.push([p.x + n[i][0] * w, p.y + n[i][1] * w]);
    right.push([p.x - n[i][0] * w, p.y - n[i][1] * w]);
  });
  return [...left, ...right.reverse()];
}

export interface Bristle {
  from: [number, number];
  to: [number, number];
  width: number;
}

/**
 * The dry-brush hairs that trail off the end of a fast stroke. A wet brush
 * doesn't do this — the ink closes over the gap — so wetness suppresses them,
 * and a formal hand suppresses them further.
 */
export function bristles(points: SamplePoint[], widths: number[], ink: InkParams): Bristle[] {
  if (points.length < 3) return [];
  const speeds = speedProfile(points);
  const exit = speeds[speeds.length - 1] / Math.max(0.15, ...speeds);
  const dryness = (1 - ink.wetness) * exit * (1 - ink.formality * 0.5);
  const count = Math.round(dryness * 7);
  if (count < 1) return [];

  const tail = points[points.length - 1];
  const before = points[Math.max(0, points.length - 4)];
  const dx = tail.x - before.x, dy = tail.y - before.y;
  const len = Math.hypot(dx, dy) || 1;
  const dir: [number, number] = [dx / len, dy / len];
  const normal: [number, number] = [-dir[1], dir[0]];

  const random = rng(ink.seed * 31 + points.length);
  const reach = widths[widths.length - 1] * (1.6 + dryness * 4.5);
  return Array.from({ length: count }, (_, i) => {
    const spread = (i / Math.max(1, count - 1) - 0.5) * 2;      // -1..1 across the tip
    const offset = spread * widths[widths.length - 1] * 0.85;
    const length = reach * (0.45 + random() * 0.75);
    const drift = (random() - 0.5) * 0.4;
    return {
      from: [tail.x + normal[0] * offset, tail.y + normal[1] * offset],
      to: [
        tail.x + normal[0] * (offset + drift * length) + dir[0] * length,
        tail.y + normal[1] * (offset + drift * length) + dir[1] * length,
      ],
      width: Math.max(0.5, widths[widths.length - 1] * 0.3),
    };
  });
}
