// Look-alike characters, for read mode's distractors.
//
// Reading in the wild fails on glyphs that resemble each other — 木/本, 日/曰,
// 土/士, 我/找 — but read mode's wrong answers were ranked on part of speech and
// gloss length alone, so the one failure that actually costs you a sign or a
// menu was the one thing the test never probed. This builds the map that fixes
// that: hanzi -> the characters it is easy to misread as.
//
// The similarity is computed from the same makemeahanzi stroke medians that
// brush mode grades against (data/strokes-hsk.json), so the app has one notion
// of what a character looks like rather than two that can disagree.
//
// Why geometry rather than the radical and stroke count already on the card:
// that heuristic misses nearly every pair that matters, because look-alikes are
// mostly filed under *different* radicals — that is often the whole difference.
// From this repo's own data/hanzi.json: 木/禾, 日/曰, 日/目, 土/士, 王/玉, 人/入
// and 我/找 (戈 vs 扌) are all cross-radical. Meanwhile it fires on pairs nobody
// confuses: 咖 吃 叫 share 口 at similar stroke counts and look nothing alike,
// because a radical is only a third of the glyph. Component decomposition is no
// better on its own — hanzi.json gives 日 and 曰 the *same* IDS (⿴口一), and
// 我 and 找 the same again (⿰扌戈), so it cannot rank the very pairs it groups,
// and it is simply absent for 自 己 已 人 入.
//
//   npm run build:lookalikes --workspace apps/api
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "../data/strokes-hsk.json");
const OUT = join(here, "../../web/src/data/lookalikes.ts");

/** Rasterisation grid. 24x24 keeps a stroke's worth of detail — finer and two
 *  drawings of the same character stop overlapping at all; coarser and every
 *  character becomes the same square blob. */
const GRID = 24;
/** makemeahanzi's em box: x in [0,1024], y up from -124 to 900. */
const TOP = 900, SPAN = 1024;
/** Look-alikes have near-identical stroke counts (木/本 differ by one, 日/曰 and
 *  我/找 by none). Gating on that cuts the pairwise work by an order of
 *  magnitude and removes the one difference a reader can always resolve. */
const STROKE_GATE = 2;
/** Candidates ranked per character before the map is made symmetric. */
const TOP_K = 8;
/** How far above a character's own mean similarity a neighbour must sit. See
 *  keepAbove below for why this is a z-score and not a flat cutoff. */
const Z_MIN = 2.5;
/** Ceiling on a finished list. Past ten the tail is noise, and every entry is a
 *  distractor that could have been a semantic one instead. */
const MAX_PER_CHAR = 10;

interface Row { hanzi: string; medians: number[][][] }

/**
 * Ink coverage of one character on a GRID x GRID square.
 *
 * `fit` stretches the glyph's bounding box to fill the grid instead of leaving
 * it where it was drawn. Both are needed: as-drawn catches the ordinary case,
 * but the pairs that differ *only* in proportion — 日 against 曰, 口 against 田
 * — are exactly the ones an as-drawn comparison pulls apart, because it is
 * measuring the one difference the reader is most likely to miss.
 */
function raster(medians: number[][][], fit: boolean): Float32Array {
  const grid = new Float32Array(GRID * GRID);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const stroke of medians) for (const [x, y] of stroke) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);

  const put = (x: number, y: number) => {
    const u = fit ? (x - minX) / w : x / SPAN;
    const v = fit ? (maxY - y) / h : (TOP - y) / SPAN;   // y runs up, rows run down
    const col = Math.min(GRID - 1, Math.max(0, Math.floor(u * GRID)));
    const row = Math.min(GRID - 1, Math.max(0, Math.floor(v * GRID)));
    grid[row * GRID + col] += 1;
  };

  for (const stroke of medians) {
    if (stroke.length === 1) { put(stroke[0][0], stroke[0][1]); continue; }
    for (let i = 0; i < stroke.length - 1; i++) {
      const [ax, ay] = stroke[i], [bx, by] = stroke[i + 1];
      // Medians are simplified polylines, so a segment can span the whole glyph.
      // Walk it in sub-cell steps or the ink lands as disconnected dots.
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
      for (let s = 0; s <= steps; s++) {
        put(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
      }
    }
  }
  return grid;
}

/** One 3x3 gaussian pass, so a stroke that sits a cell off its counterpart still
 *  counts as the same stroke. Without it every comparison is near zero. */
function blur(grid: Float32Array): Float32Array {
  const out = new Float32Array(GRID * GRID);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          sum += grid[r * GRID + c] * (dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1);
        }
      }
      out[row * GRID + col] = sum / 16;
    }
  }
  return out;
}

/** Unit vector, after a square root that stops the pile-up where strokes cross
 *  or bend from dominating the comparison — a junction is not four times the
 *  glyph that a plain stroke is. */
function unit(grid: Float32Array): Float32Array {
  const out = new Float32Array(grid.length);
  let norm = 0;
  for (let i = 0; i < grid.length; i++) { out[i] = Math.sqrt(grid[i]); norm += out[i] * out[i]; }
  const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function main(): void {
  const rows = JSON.parse(readFileSync(SOURCE, "utf8")) as Row[];
  const chars: string[] = [];
  const placed: Float32Array[] = [];
  const fitted: Float32Array[] = [];
  const strokes: number[] = [];

  for (const row of rows) {
    if (!row.medians?.length) continue;
    chars.push(row.hanzi);
    placed.push(unit(blur(raster(row.medians, false))));
    fitted.push(unit(blur(raster(row.medians, true))));
    strokes.push(row.medians.length);   // the geometry's own count, not a lookup
  }
  console.log(`· ${chars.length} characters with stroke geometry`);

  /**
   * Raw similarity is not comparable between characters, which is why the cut
   * is a z-score against each character's own candidates rather than a flat
   * number. A 3-stroke character has little ink, so its genuine twin scores
   * 0.84 (土/士); a 12-stroke character has ink everywhere, so a passing
   * resemblance scores 0.87 (谢/涮). One threshold cannot serve both — but "far
   * out in the tail of what this character resembles" means the same thing at
   * either density.
   */
  const ranked: { other: number; z: number }[][] = [];
  for (let i = 0; i < chars.length; i++) {
    const scores: { other: number; score: number }[] = [];
    let sum = 0, sumSq = 0;
    for (let j = 0; j < chars.length; j++) {
      if (i === j || Math.abs(strokes[i] - strokes[j]) > STROKE_GATE) continue;
      const score = Math.max(dot(placed[i], placed[j]), dot(fitted[i], fitted[j]));
      scores.push({ other: j, score });
      sum += score;
      sumSq += score * score;
    }
    const n = scores.length || 1;
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean)) || 1;
    scores.sort((a, b) => b.score - a.score);
    ranked.push(scores.slice(0, TOP_K)
      .map(s => ({ other: s.other, z: (s.score - mean) / sd }))
      .filter(s => s.z >= Z_MIN));
  }

  // Confusability is mutual — if you can misread 我 as 找 you can misread 找 as
  // 我 — but a per-character cut is not, because the two have different fields
  // of near neighbours. 找 sits in a crowd of 扌 characters and so ranks 我 out
  // of its own top eight, while 我 ranks 找 in. Union, not intersection.
  const lists = ranked.map(list => new Map(list.map(s => [s.other, s.z])));
  for (let i = 0; i < chars.length; i++) {
    for (const { other, z } of ranked[i]) if (!lists[other].has(i)) lists[other].set(i, z);
  }

  const packed: string[] = [];
  let pairs = 0;
  for (let i = 0; i < chars.length; i++) {
    const near = [...lists[i].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PER_CHAR)
      .map(([other]) => chars[other]);
    if (!near.length) continue;
    pairs += near.length;
    packed.push(chars[i] + near.join(""));   // key first, then most-alike first
  }

  const body = packed.join("\n");
  writeFileSync(OUT, `${HEADER}export const LOOKALIKE_ROWS = \`${body}\`;\n`);
  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`Wrote ${packed.length} characters' look-alikes to web/src/data/lookalikes.ts (${kb} KB)`);
  console.log(`· ${pairs} directed pairs, ${(pairs / packed.length).toFixed(1)} per character`);
  const without = chars.length - packed.length;
  if (without) console.log(`· ${without} character(s) resemble nothing closely enough — no look-alike distractor for those`);
}

const HEADER = `// Generated by apps/api/scripts/build-lookalikes.ts — do not edit by hand.
//
// Characters that are easy to misread as one another, so read mode can offer a
// look-alike's meaning as a wrong answer: shown 木, a learner who cannot yet
// tell it from 本 should have the chance to reach for "root; origin" and find
// out. Ranked by how strongly two glyphs' inked areas coincide, computed from
// makemeahanzi stroke medians — see the generator for why geometry rather than
// the radical and stroke count already carried on every card.
//
// One row per character: the character itself, then its look-alikes, most alike
// first. Bundled rather than fetched because meaningChoices runs synchronously
// during render and decides whether read mode is a quiz at all.
`;

main();
