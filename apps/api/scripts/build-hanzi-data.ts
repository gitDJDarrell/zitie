// Builds the bundled character-structure dataset that grounds AI enrichment.
//
// Roadmap decision #1: the model *explains* verified components, it never
// invents which components exist. That promise only holds if the structure
// facts come from open reference data, so this script distills three public
// sources into one compact file committed at apps/api/data/hanzi.json:
//
//   - makemeahanzi dictionary.txt — decomposition (IDS), radical, pinyin,
//     English gloss, and Unihan/CEDICT-derived etymology hints.
//     https://github.com/skishore/makemeahanzi (LGPL; data from Unihan +
//     CC-CEDICT, CC BY-SA 3.0)
//   - makemeahanzi graphics.txt — stroke paths, used only for a stroke count.
//   - cjkvi-ids ids.txt — CHISE IDS database, used to fill decompositions
//     makemeahanzi leaves as "？". https://github.com/cjkvi/cjkvi-ids
//
// Run it only when refreshing the dataset; normal builds read the committed
// JSON. Sources are downloaded to a scratch dir (~35 MB) and thrown away:
//
//   npm run build:hanzi --workspace apps/api            # download + build
//   npm run build:hanzi --workspace apps/api -- ./src   # reuse a local dir
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../data/hanzi.json");

const SOURCES = {
  "dictionary.txt": "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt",
  "graphics.txt": "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt",
  "ids.txt": "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt",
};

// Ideographic Description Characters — the ⿰⿱… operators inside an IDS.
const IDC = /[⿰-⿻]/;

interface MmahEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  radical?: string;
  etymology?: { type?: string; phonetic?: string; semantic?: string; hint?: string };
}

async function ensureSources(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const path = join(dir, name);
    if (existsSync(path) && statSync(path).size > 0) {
      console.log(`· ${name} already present`);
      continue;
    }
    console.log(`· downloading ${name}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
}

// Glosses run long ("to eat; to drink; to suffer, to endure, to bear"). Keep
// the leading senses — enough to explain a component, short enough that 9.5k
// of them stay a reasonable file.
function trimGloss(def: string | undefined, max = 90): string | undefined {
  if (!def) return undefined;
  const clean = def.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const senses = clean.split(";");
  let out = senses[0].trim();
  for (const s of senses.slice(1)) {
    if (`${out}; ${s.trim()}`.length > max) break;
    out += `; ${s.trim()}`;
  }
  return out.length <= max ? out : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function parseIds(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [, char, ...forms] = line.split("\t");
    if (!char || char.length !== 1) continue;
    // Prefer an unsourced form; region-tagged ones look like "⿰口乞(G)".
    const form = forms.map((f) => f.replace(/[\^$]/g, "").trim())
      .find((f) => f && !f.includes("(") && f !== char)
      ?? forms[0]?.replace(/[\^$]|\([A-Z]+\)/g, "").trim();
    if (form && form !== char && IDC.test(form)) out.set(char, form);
  }
  return out;
}

function parseStrokeCounts(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { character: string; strokes?: string[] };
    if (row.character && row.strokes?.length) out.set(row.character, row.strokes.length);
  }
  return out;
}

async function main() {
  const srcDir = process.argv[2] ?? join(tmpdir(), "zitie-hanzi-src");
  await ensureSources(srcDir);

  const dict = readFileSync(join(srcDir, "dictionary.txt"), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l) as MmahEntry);
  const ids = parseIds(readFileSync(join(srcDir, "ids.txt"), "utf8"));
  const strokes = parseStrokeCounts(readFileSync(join(srcDir, "graphics.txt"), "utf8"));

  // Short keys: this file is parsed on every API boot and read by the
  // enrichment worker, never edited by hand.
  const out: Record<string, {
    d?: string; r?: string; p?: string[]; g?: string; s?: number;
    e?: { t?: string; p?: string; s?: string; h?: string };
  }> = {};

  let filledFromIds = 0;
  for (const entry of dict) {
    const char = entry.character;
    if (!char || char.length !== 1) continue;

    let decomposition = entry.decomposition;
    if (!decomposition || decomposition.includes("？")) {
      const fallback = ids.get(char);
      if (fallback && !fallback.includes("？")) {
        decomposition = fallback;
        filledFromIds++;
      }
    }
    // A decomposition with no operator (or still holding unknowns) says
    // nothing useful — drop it rather than ship a half-fact.
    if (decomposition && (!IDC.test(decomposition) || decomposition.includes("？"))) {
      decomposition = undefined;
    }

    const ety = entry.etymology;
    out[char] = {
      ...(decomposition ? { d: decomposition } : {}),
      ...(entry.radical ? { r: entry.radical } : {}),
      ...(entry.pinyin?.length ? { p: entry.pinyin.slice(0, 3) } : {}),
      ...(trimGloss(entry.definition) ? { g: trimGloss(entry.definition) } : {}),
      ...(strokes.has(char) ? { s: strokes.get(char) } : {}),
      ...(ety?.type || ety?.hint ? {
        e: {
          ...(ety.type ? { t: ety.type } : {}),
          ...(ety.phonetic ? { p: ety.phonetic } : {}),
          ...(ety.semantic ? { s: ety.semantic } : {}),
          ...(ety.hint ? { h: ety.hint.replace(/\s+/g, " ").trim() } : {}),
        },
      } : {}),
    };
  }

  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`Wrote ${Object.keys(out).length} characters to data/hanzi.json (${kb} KB)`);
  console.log(`· ${filledFromIds} decomposition(s) filled from the CHISE IDS database`);
}

main().catch((err) => { console.error(err); process.exit(1); });
