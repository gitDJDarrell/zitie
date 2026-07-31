import { rng } from "./ink";

/* ————————————————— the paper —————————————————
   A flat fill reads as a text field with a character in it. Real 宣纸 is a
   warm, uneven sheet with fibres in it, and ink behaves differently because of
   that unevenness — which is the whole reason the writing looks like painting
   rather than typography.

   Generated once per size and cached: this is a few thousand draw calls and has
   no business running on every pointer move. */

export interface PaperTone {
  /** Base sheet colour. */
  base: string;
  /** Fibre fleck colour, drawn at low alpha. */
  fibre: string;
  /** Ruling and frame lines. */
  rule: string;
}

// One sheet, both themes. The first cut had a dark sheet for dark mode, and
// QA found the obvious-in-hindsight problem: near-black ink on near-black
// paper is invisible. Real calligraphy solves this the same way — the room
// gets dark, the paper doesn't. A lit sheet on a dark desk is the look.
export const PAPER_TONE: PaperTone = {
  // Aged mulberry paper: warm, slightly yellow, never white.
  base: "#efe9dc", fibre: "#c9bda4", rule: "rgba(120,105,80,0.28)",
};

const cache = new Map<string, HTMLCanvasElement>();

/**
 * A sheet of paper as an offscreen canvas: base wash, fibres, a few blotches
 * where the pulp settled unevenly, and a vignette so the sheet has a middle.
 *
 * Deterministic in `seed`, so the same sheet comes back every render and the
 * texture doesn't crawl while the ink controls are being dragged.
 */
export function paperTexture(size: number, tone: PaperTone, seed = 1): HTMLCanvasElement {
  const key = `${size}:${tone.base}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = tone.base;
  ctx.fillRect(0, 0, size, size);

  const random = rng(seed);

  // Broad tonal drift: a handful of soft washes so the sheet isn't one value.
  for (let i = 0; i < 14; i++) {
    const x = random() * size, y = random() * size;
    const r = size * (0.15 + random() * 0.4);
    const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = random() > 0.5;
    wash.addColorStop(0, dark ? "rgba(90,78,58,0.045)" : "rgba(255,250,235,0.05)");
    wash.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fibres: short strands lying every which way, as in a sheet of handmade
  // paper held up to the light.
  ctx.lineCap = "round";
  for (let i = 0; i < Math.round(size * 2.2); i++) {
    const x = random() * size, y = random() * size;
    const angle = random() * Math.PI;
    const len = 1 + random() * 7;
    ctx.strokeStyle = tone.fibre;
    ctx.globalAlpha = 0.03 + random() * 0.06;
    ctx.lineWidth = 0.4 + random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Specks: the odd fleck of husk left in the pulp.
  for (let i = 0; i < Math.round(size * 0.12); i++) {
    ctx.globalAlpha = 0.05 + random() * 0.09;
    ctx.fillStyle = tone.fibre;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 0.4 + random() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Vignette: the edges of a sheet catch less light than the middle.
  const edge = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.32,
    size / 2, size / 2, size * 0.78,
  );
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(70,58,40,0.10)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  // One sheet per size is plenty; a session that resizes a lot shouldn't grow
  // this without bound.
  if (cache.size > 8) cache.clear();
  cache.set(key, canvas);
  return canvas;
}
