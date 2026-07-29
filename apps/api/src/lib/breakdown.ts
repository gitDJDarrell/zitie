// Composes a character's breakdown from verified facts alone — the seed path
// that covers all 3,000 dex characters without a model call.
//
// Everything here is a restatement of the bundled dataset: the structure comes
// from the IDS operator, the components and their readings from the
// decomposition, the account of the character from Unihan/CEDICT's recorded
// etymology. Where the data records no account, the story says so rather than
// inventing one — a dry true sentence beats a vivid invented one, and the
// runtime worker (or a later hand-written pass) can always upgrade the row.
import type { HanziFacts } from "./hanzi.js";

export type ComponentRole = "semantic" | "phonetic" | "meaning" | "form";

export interface BreakdownComponent {
  char: string;
  reading?: string;
  gloss?: string;
  role: ComponentRole;
  note?: string;
}

export interface Compound { zh: string; py?: string; en?: string }

// The Ideographic Description Characters, in plain English. These describe how
// the parts sit on the page, which is what a learner sees first.
const STRUCTURE: Record<string, string> = {
  "⿰": "⿰ left–right", "⿱": "⿱ stacked", "⿲": "⿲ three across",
  "⿳": "⿳ three stacked", "⿴": "⿴ enclosed", "⿵": "⿵ wrapped from above",
  "⿶": "⿶ wrapped from below", "⿷": "⿷ wrapped from the left",
  "⿸": "⿸ upper-left wrap", "⿹": "⿹ upper-right wrap",
  "⿺": "⿺ lower-left wrap", "⿻": "⿻ overlapping",
};

export function structureLabel(decomposition?: string): string {
  const operator = decomposition?.[0];
  return (operator && STRUCTURE[operator]) ?? "simple / indivisible";
}

/**
 * The structure line shown on the card. A pictograph gets "pictograph" rather
 * than its IDS shape: its decomposition is a stroke split, and printing "⿲
 * three across" above an empty component list invites the reader to look for
 * three parts that mean something.
 */
export function structureFor(facts: HanziFacts): string {
  if (facts.etymology?.type === "pictographic") return "pictograph";
  return structureLabel(facts.decomposition);
}

/**
 * Component entries in written order, with roles the data actually supports.
 *
 * A part is only called "meaning" where the recorded etymology says the parts
 * combine by sense; under a pictophonetic reading exactly one part carries the
 * meaning and one the sound, and anything else is shape. Where no etymology is
 * recorded, every part is "form" — the decomposition proves the character is
 * written from these pieces, not that the pieces explain it.
 *
 * A pictograph gets no components at all: its IDS splits it into strokes, and
 * a stroke has no role to play in a drawing.
 */
export function componentEntries(facts: HanziFacts, lookup: (c: string) => HanziFacts | null): BreakdownComponent[] {
  const ety = facts.etymology;
  if (ety?.type === "pictographic") return [];

  return facts.components.map((char) => {
    const part = lookup(char);
    const role: ComponentRole =
      ety?.semantic === char ? "semantic"
      : ety?.phonetic === char ? "phonetic"
      : ety?.type === "ideographic" && part?.gloss ? "meaning"
      : "form";
    return {
      char,
      ...(part?.readings[0] ? { reading: part.readings[0] } : {}),
      // The sound half's meaning is a distraction — 妈 has nothing to do with
      // horses — so a phonetic component shows its reading only.
      ...(part?.gloss && role !== "phonetic" ? { gloss: part.gloss } : {}),
      role,
      ...(char === facts.radical ? { note: "The radical — where the character is filed in a dictionary." } : {}),
    };
  });
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?。！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** First sense only — a full CEDICT gloss is too long to sit inside a sentence. */
function firstSense(gloss?: string): string | undefined {
  const sense = gloss?.split(/[;,]/)[0].trim();
  return sense || undefined;
}

function describe(char: string, facts: HanziFacts | null, withGloss = true): string {
  const reading = facts?.readings[0];
  const gloss = withGloss ? firstSense(facts?.gloss) : undefined;
  if (reading && gloss) return `${char} (${reading}, ${gloss})`;
  if (reading) return `${char} (${reading})`;
  if (gloss) return `${char} (${gloss})`;
  return char;
}

function lowerFirst(text: string): string {
  return text[0].toLowerCase() + text.slice(1);
}

/**
 * A sentence or two a learner can hold onto, built only from what the data
 * records — and saying plainly when that is nothing. Deliberately free of
 * general advice: the same closing line under 1,500 characters stops being
 * read after the third one.
 */
export function storyFor(facts: HanziFacts, lookup: (c: string) => HanziFacts | null): string {
  const ety = facts.etymology;
  const hint = ety?.hint?.trim();
  const shape = structureLabel(facts.decomposition);

  if (ety?.type === "pictophonetic") {
    const semantic = ety.semantic ? describe(ety.semantic, lookup(ety.semantic)) : null;
    // The sound half is named without its meaning on purpose: 妈 borrows the
    // sound of 马, not the horse.
    const phonetic = ety.phonetic ? describe(ety.phonetic, lookup(ety.phonetic), false) : null;
    if (semantic && phonetic) {
      return `A sound-and-sense compound written ${shape}: ${semantic} fixes what it is about, and ${phonetic} is there for the sound.`;
    }
    if (semantic) {
      return `A sound-and-sense compound written ${shape}: ${semantic} fixes what it is about. The data doesn't record which part carries the sound.`;
    }
    if (phonetic) {
      return `A sound-and-sense compound written ${shape}, taking its sound from ${phonetic}. The data doesn't record which part carries the meaning.`;
    }
  }

  if (ety?.type === "pictographic") {
    return hint
      ? `A picture, not a compound: ${sentence(lowerFirst(hint))}`
      : "A picture, not a compound — one drawing rather than parts borrowed from other characters.";
  }

  if (ety?.type === "ideographic") {
    const parts = facts.components.map((c) => describe(c, lookup(c))).join(" and ");
    if (hint) return `The parts combine by meaning: ${sentence(lowerFirst(hint))}`;
    return parts
      ? `The parts combine by meaning rather than by sound — ${parts}, written ${shape}.`
      : "The parts combine by meaning rather than by sound.";
  }

  if (facts.components.length) {
    const parts = facts.components.map((c) => describe(c, lookup(c))).join(" and ");
    const meaning = firstSense(facts.gloss);
    return `Written ${shape}, from ${parts}. The data records the parts but no account of how they came to mean ${meaning ? `“${meaning}”` : "what it means"} — so the split is a way to remember the shape, not an explanation of it.`;
  }

  return `One indivisible form${facts.strokes ? `, ${facts.strokes} strokes` : ""} — nothing inside it to take apart. Characters like this are the pieces other characters are built from.`;
}

export interface CompoundCandidate extends Compound { level?: string; freq?: number }

// Level ids sort by how early a learner meets them; "7-9" is the combined
// advanced tier, and an unlisted word sorts after everything examinable.
const LEVEL_RANK: Record<string, number> = { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7-9": 7 };

/**
 * The words to show under "appears in": real vocabulary containing the
 * character, earliest-examinable first, then by how common the word is. Two-
 * and three-character words are preferred — a four-character idiom is not what
 * someone meeting the character needs — but a handful of characters have no
 * shorter word in the standard at all (六 and 七 appear only in 五颜六色 and
 * 乱七八糟), and for those an idiom beats an empty section.
 */
export function pickCompounds(hanzi: string, candidates: CompoundCandidate[], limit = 4): Compound[] {
  const seen = new Set<string>();
  const byLevelThenFreq = (a: CompoundCandidate, b: CompoundCandidate) => {
    const rank = (LEVEL_RANK[a.level ?? ""] ?? 9) - (LEVEL_RANK[b.level ?? ""] ?? 9);
    return rank !== 0 ? rank : (b.freq ?? 0) - (a.freq ?? 0);
  };
  const containing = candidates
    .filter((w) => w.zh.includes(hanzi) && w.zh.length >= 2)
    .filter((w) => (seen.has(w.zh) ? false : (seen.add(w.zh), true)));
  const short = containing.filter((w) => w.zh.length <= 3);
  return (short.length ? short : containing)
    .sort(byLevelThenFreq)
    .slice(0, limit)
    .map(({ zh, py, en }) => ({ zh, ...(py ? { py } : {}), ...(en ? { en } : {}) }));
}
