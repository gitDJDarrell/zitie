// Stroke geometry for the brush-writing study mode: the outline of every
// stroke and, more importantly, its centreline.
//
// Two things come out of makemeahanzi's graphics.txt per character:
//   strokes — an SVG path per stroke, the shape you draw to render the glyph
//   medians — the centreline of each stroke as a point list, in written order
//
// The medians are what make brush mode a test rather than a sketchpad. A
// stroke someone draws is a polyline; comparing it against these centrelines
// says which stroke they meant, whether they drew it in the right direction,
// and whether the whole character came out in the right order.
//
// Scoped to the 3,000 dex characters on purpose. All 9,574 would be 29 MB;
// the dex is 7.6 MB, which is a reasonable seed and a table the app can read
// one character at a time.
//
//   npm run build:strokes --workspace apps/api            # download + build
//   npm run build:strokes --workspace apps/api -- /path    # reuse a scratch dir
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../data/strokes-hsk.json");
const DEX = join(here, "../../web/src/data/dex.ts");
const SOURCE = "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt";

interface Graphics {
  character: string;
  strokes?: string[];
  medians?: number[][][];
}

async function ensureSource(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "graphics.txt");
  if (existsSync(path) && statSync(path).size > 0) {
    console.log("· graphics.txt already present");
    return path;
  }
  console.log("· downloading graphics.txt…");
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE} → HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

/** The dex is defined in the web app; read the characters straight out of it. */
function readDexChars(): Set<string> {
  const src = readFileSync(DEX, "utf8");
  const chars = new Set<string>();
  for (const m of src.matchAll(/chars: "([^"]+)"/g)) {
    for (const ch of m[1]) chars.add(ch);
  }
  return chars;
}

/**
 * Medians carry sub-pixel precision the grader has no use for — the whole
 * canvas is 1024 units wide and a brush stroke is tens of units thick. Rounding
 * to integers and dropping collinear points cuts the file by a third with no
 * effect on any comparison made against it.
 */
function simplify(points: number[][], tolerance = 4): number[][] {
  const rounded = points.map(([x, y]) => [Math.round(x), Math.round(y)]);
  if (rounded.length <= 2) return rounded;
  const out = [rounded[0]];
  for (let i = 1; i < rounded.length - 1; i++) {
    const prev = out[out.length - 1];
    const next = rounded[i + 1];
    // Keep the point when the path actually bends here; drop it when it sits
    // close enough to the straight line between its neighbours.
    if (perpendicular(rounded[i], prev, next) > tolerance) out.push(rounded[i]);
  }
  out.push(rounded[rounded.length - 1]);
  return out;
}

function perpendicular([px, py]: number[], [ax, ay]: number[], [bx, by]: number[]): number {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
}

async function main() {
  const srcDir = process.argv[2] ?? join(tmpdir(), "zitie-hanzi-src");
  const path = await ensureSource(srcDir);
  const dex = readDexChars();

  const rows: { hanzi: string; strokes: string[]; medians: number[][][] }[] = [];
  const missing: string[] = [];

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as Graphics;
    if (!dex.has(entry.character)) continue;
    if (!entry.strokes?.length || !entry.medians?.length) {
      missing.push(entry.character);
      continue;
    }
    rows.push({
      hanzi: entry.character,
      strokes: entry.strokes,
      medians: entry.medians.map((m) => simplify(m)),
    });
  }

  const found = new Set(rows.map((r) => r.hanzi));
  const absent = [...dex].filter((ch) => !found.has(ch));

  writeFileSync(OUT, JSON.stringify(rows));
  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`Wrote ${rows.length} characters' stroke geometry to data/strokes-hsk.json (${kb} KB)`);
  if (absent.length) {
    console.log(`· ${absent.length} dex character(s) with no stroke data: ${absent.slice(0, 20).join(" ")}`);
    console.log("  (brush mode falls back to freehand for these — no target, no grading)");
  }
  if (missing.length) console.log(`· ${missing.length} entr(ies) had a character but no usable geometry`);
}

main().catch((err) => { console.error(err); process.exit(1); });
