// Structural facts about individual characters, read from the bundled dataset
// built by scripts/build-hanzi-data.ts (CHISE IDS + Unihan/CEDICT via
// makemeahanzi). This is the grounding layer for AI enrichment: the model gets
// these facts as tool results and explains them, so a breakdown never depends
// on the model remembering which components a character has.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Ideographic Description Characters (U+2FF0–U+2FFB): the ⿰⿱⿴… operators
// that join components inside an IDS. Not components themselves.
const IDC_RANGE = /[⿰-⿻]/;

interface RawEntry {
  d?: string;                       // decomposition (IDS)
  r?: string;                       // radical
  p?: string[];                     // readings, pinyin with tone marks
  g?: string;                       // English gloss
  s?: number;                       // stroke count
  e?: { t?: string; p?: string; s?: string; h?: string };  // etymology
}

export interface HanziFacts {
  hanzi: string;
  /** Ideographic Description Sequence, e.g. "⿰口乞". Absent for atomic forms. */
  decomposition?: string;
  /** The component characters of the decomposition, operators stripped. */
  components: string[];
  radical?: string;
  readings: string[];
  gloss?: string;
  strokes?: number;
  etymology?: {
    /** pictophonetic | ideographic | pictographic */
    type?: string;
    /** the component lending the sound (pictophonetic only) */
    phonetic?: string;
    /** the component lending the meaning (pictophonetic only) */
    semantic?: string;
    hint?: string;
  };
}

let table: Record<string, RawEntry> | null = null;

// 1.4 MB of JSON — parsed on first lookup, not at boot, so an API instance
// that never enriches anything never pays for it.
function load(): Record<string, RawEntry> {
  if (!table) {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../../data/hanzi.json");
    table = JSON.parse(readFileSync(path, "utf8")) as Record<string, RawEntry>;
  }
  return table;
}

/**
 * Component characters of an IDS, in written order, with the description
 * operators removed. Stroke-level pieces (㇇, 丿) are kept — they are what the
 * decomposition actually says — but duplicates collapse.
 */
export function idsComponents(ids: string | undefined): string[] {
  if (!ids) return [];
  const out: string[] = [];
  for (const ch of ids) {
    if (IDC_RANGE.test(ch) || ch === "？") continue;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Everything the dataset knows about one character, or null if unlisted. */
export function lookupHanzi(char: string): HanziFacts | null {
  const entry = load()[char];
  if (!entry) return null;
  const ety = entry.e;
  return {
    hanzi: char,
    decomposition: entry.d,
    components: idsComponents(entry.d).filter((c) => c !== char),
    radical: entry.r,
    readings: entry.p ?? [],
    gloss: entry.g,
    strokes: entry.s,
    etymology: ety && {
      type: ety.t, phonetic: ety.p, semantic: ety.s, hint: ety.h,
    },
  };
}

/**
 * A character plus its components, one level down — the shape the enrichment
 * prompt starts from. Components the dataset doesn't list are skipped rather
 * than guessed at.
 */
export function lookupWithComponents(char: string): { root: HanziFacts; components: HanziFacts[] } | null {
  const root = lookupHanzi(char);
  if (!root) return null;
  const components = root.components
    .map(lookupHanzi)
    .filter((f): f is HanziFacts => f !== null);
  return { root, components };
}

/** Number of characters in the bundled dataset (used by the health check). */
export function hanziDataCount(): number {
  return Object.keys(load()).length;
}
