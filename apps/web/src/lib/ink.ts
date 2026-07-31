/* ————————————————— the brush —————————————————
   A stroke is kept as the points and timings it was drawn with, never as
   pixels. Everything below turns that record into ink at render time, which is
   what lets the controls restyle writing that already exists: load the brush
   with more water and the same gesture comes out of a wetter brush.

   The parameters are the ones a calligrapher would name, not the ones a
   renderer would find convenient — 濃 how dark the ink is ground, 潤 how much
   water is in the brush, 飛白 the dry streaks a fast stroke leaves, 提按 the
   lift and press that makes a line breathe, 側鋒 writing on the side of the
   tip. Each changes the picture in a way you can see and say a word about.

   None of this touches a canvas — it produces geometry and numbers, so the
   parts worth being sure about can be tested without a browser. */

export interface InkParams {
  /** 大小 — brush size. Everything scales off this. */
  weight: number;
  /** 濃 — how densely the ink is ground: pale grey wash to full black. */
  density: number;
  /** 潤 — water in the brush. Wet ink bleeds into the paper and closes gaps. */
  water: number;
  /** 飛白 — "flying white": the dry streaks a fast brush leaves inside a stroke. */
  flyingWhite: number;
  /** 提按 — lift and press. How strongly the line answers changes of speed. */
  pressure: number;
  /** 側鋒 — writing on the side of the tip, so one flank runs heavier. */
  slant: number;
  /** Seeds every random choice, so a given hand is reproducible. */
  seed: number;
}

export const DEFAULT_INK: InkParams = {
  weight: 0.5, density: 0.82, water: 0.35,
  flyingWhite: 0.45, pressure: 0.55, slant: 0.3, seed: 7,
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

/** Cumulative distance along the stroke, 0 at the start, 1 at the tip. */
export function travel(points: SamplePoint[]): number[] {
  if (points.length < 2) return points.map(() => 0);
  const out = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    out.push(total);
  }
  return total === 0 ? out.map(() => 0) : out.map((d) => d / total);
}

/**
 * Half-width at every sample, in px.
 *
 * 提按 is the parameter that matters here: a brush held lightly and pressed
 * unevenly gives a line that swells and narrows, and a brush dragged at one
 * pressure gives a pipe. Speed stands in for pressure — you slow down where you
 * press — so a fast passage thins and a deliberate one thickens.
 */
export function widthProfile(points: SamplePoint[], ink: InkParams, scale: number): number[] {
  // Tuned against a 384px pad: at the default weight a stroke is ~15px wide,
  // which leaves an eight-stroke character legible rather than filled in.
  const base = (0.008 + 0.022 * ink.weight) * scale;
  const speeds = speedProfile(points);
  const fastest = Math.max(0.15, ...speeds);
  const random = rng(ink.seed);
  // The hand is never perfectly steady, and a heavier press wanders more.
  const wander = points.map(() => 1 + (random() - 0.5) * 0.28 * ink.pressure);

  return points.map((_, i) => {
    const fraction = points.length > 1 ? i / (points.length - 1) : 0;
    const thinning = 1 - ink.pressure * 0.75 * (speeds[i] / fastest);
    // Landing: quick ramp over the first tenth. Lifting: long taper over the
    // last quarter, which is where a brush leaves its characteristic point.
    const landing = Math.min(1, fraction / 0.1 + 0.35);
    const lifting = fraction < 0.75 ? 1 : 1 - ((fraction - 0.75) / 0.25) ** 1.6 * 0.8;
    const ends = Math.min(landing, lifting);
    // Water swells the line; a dry brush holds a finer one.
    const loaded = 1 + ink.water * 0.22;
    return Math.max(base * 0.12, base * thinning * ends * wander[i] * loaded);
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
 *
 * 側鋒 splits the two flanks. A brush held upright puts the tip in the middle
 * of the line and both sides match; tilted onto its side, the belly of the
 * brush lays down more ink on one flank than the other, and the stroke stops
 * looking like a symmetrical ribbon.
 */
export function strokeOutline(
  points: SamplePoint[], widths: number[], slant = 0,
): [number, number][] {
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
  const heavy = 1 + slant * 0.55;      // the flank the belly rides on
  const light = 1 - slant * 0.45;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  points.forEach((p, i) => {
    const w = widths[i];
    left.push([p.x + n[i][0] * w * heavy, p.y + n[i][1] * w * heavy]);
    right.push([p.x - n[i][0] * w * light, p.y - n[i][1] * w * light]);
  });
  return [...left, ...right.reverse()];
}

/**
 * How dark the ink is at each sample, 0–1.
 *
 * 濃 sets the ceiling — pale wash to full black — and the brush then spends
 * what it is carrying: a stroke starts loaded and dries as it travels, so the
 * tail of a long stroke is lighter than its head. Water refills that reserve,
 * which is why a wet brush lays an even tone and a dry one fades.
 */
export function tonProfile(points: SamplePoint[], ink: InkParams): number[] {
  const along = travel(points);
  const speeds = speedProfile(points);
  const fastest = Math.max(0.15, ...speeds);
  // A well-watered brush barely depletes; a dry one is spent within one stroke.
  const depletion = (1 - ink.water) * 0.55;
  return points.map((_, i) => {
    const spent = along[i] * depletion;
    // Racing the brush also lifts it off the paper, leaving less behind.
    const skimming = 0.12 * ink.pressure * (speeds[i] / fastest);
    return Math.max(0.06, ink.density * (1 - spent - skimming));
  });
}

export interface Streak {
  /** Along-stroke position, 0–1, where the dry gap starts and ends. */
  from: number;
  to: number;
  /** Across-stroke position, -1 (one flank) to 1 (the other). */
  offset: number;
  /** Fraction of the local width the gap covers. */
  width: number;
}

/**
 * 飛白 — "flying white". When a brush runs faster than its ink can flow, the
 * hairs separate and the paper shows through the middle of the stroke in
 * streaks. It is the texture that most says "brush" rather than "pen", and it
 * is the first thing water suppresses: a loaded brush closes the gaps.
 *
 * Returned as positions along and across the stroke rather than pixels, so the
 * renderer can carve them out of whatever outline it ends up drawing.
 */
export function flyingWhite(points: SamplePoint[], ink: InkParams): Streak[] {
  if (points.length < 4 || ink.flyingWhite <= 0.02) return [];
  const speeds = speedProfile(points);
  const fastest = Math.max(0.15, ...speeds);
  const along = travel(points);

  // Dryness rises along the stroke as the brush spends its ink, and rises with
  // speed. Water damps the whole effect.
  const random = rng(ink.seed * 7919 + points.length * 13);
  const streaks: Streak[] = [];
  // Many short gaps rather than a few long ones: flying white is the hairs of
  // the brush separating, so it reads as broken fibre. A handful of long
  // streaks reads as somebody having scratched the paper.
  const attempts = Math.round(8 + ink.flyingWhite * 26);

  for (let i = 0; i < attempts; i++) {
    const at = random();
    // Sample the stroke's speed near that point.
    let nearest = 0;
    for (let k = 1; k < along.length; k++) {
      if (Math.abs(along[k] - at) < Math.abs(along[nearest] - at)) nearest = k;
    }
    const dryness = ink.flyingWhite
      * (0.35 + 0.65 * (speeds[nearest] / fastest))   // faster → drier
      * (0.4 + 0.6 * at)                              // later → drier
      * (1 - ink.water * 0.85);                       // water closes the gaps
    if (dryness < 0.18) continue;

    const length = 0.02 + random() * 0.09 * (0.5 + dryness);
    // Kept clear of both ends: a brush lands and lifts with its hairs together,
    // and a gap running off the tip reads as a mistake rather than as texture.
    const from = Math.max(0.08, at - length / 2);
    const to = Math.min(0.94, at + length / 2);
    if (to <= from) continue;
    streaks.push({
      from, to,
      offset: (random() - 0.5) * 1.5,
      width: Math.min(0.34, 0.05 + dryness * 0.26),
    });
  }
  return streaks;
}

export interface Bristle {
  from: [number, number];
  to: [number, number];
  width: number;
}

/**
 * The hairs that trail off the end of a fast stroke. A wet brush doesn't do
 * this — the ink closes over the gap — so water suppresses them.
 */
export function bristles(points: SamplePoint[], widths: number[], ink: InkParams): Bristle[] {
  if (points.length < 3) return [];
  const speeds = speedProfile(points);
  const exit = speeds[speeds.length - 1] / Math.max(0.15, ...speeds);
  const dryness = (1 - ink.water) * exit * (0.4 + 0.6 * ink.flyingWhite);
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

/** Ink tone as a CSS colour. Warm black, not pure — pure black reads as vector art. */
export function inkColor(tone: number): string {
  const t = Math.max(0, Math.min(1, tone));
  // Pale ink is a warm grey with the paper showing through; dense ink is
  // near-black with a trace of brown, the way a ground stick actually sits.
  const r = Math.round(26 + (1 - t) * 128);
  const g = Math.round(23 + (1 - t) * 124);
  const b = Math.round(20 + (1 - t) * 116);
  return `rgb(${r}, ${g}, ${b})`;
}
