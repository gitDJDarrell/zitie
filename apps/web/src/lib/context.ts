import { WORD_ORDER } from "../data/wordDex";
import type { SeenRecord } from "../types";
import { strengthOf } from "./srs";

/* ————————————————— reading in context —————————————————

   Zitie is for reading Chinese in the wild, and the wild does not show you one
   character on a white card. It shows you 咖啡 on a menu and 出口 over a door —
   the character you know, wedged between characters you may not, at a size and
   density you did not choose.

   Recognising a character in isolation and recognising it embedded are
   genuinely different skills, and only the second one is the goal. So the
   prompt tightens as the memory strengthens: a character you just met is shown
   alone, and one you know well is shown inside a real word, with the rest of
   the word present but quiet. Same question, less scaffolding — the training
   wheels come off by themselves.

   Every word used here comes from the HSK 3.0 word list already bundled for the
   word dex, so the context is vocabulary the learner will actually meet, not
   invented filler. */

/** Character → real HSK words containing it. Built once, lazily. */
let byChar: Map<string, string[]> | null = null;

function index(): Map<string, string[]> {
  if (byChar) return byChar;
  const m = new Map<string, string[]>();
  for (const word of WORD_ORDER) {
    if (word.length < 2) continue;           // a single character is not context
    for (const ch of new Set(word)) {
      const list = m.get(ch);
      if (list) list.push(word);
      else m.set(ch, [word]);
    }
  }
  byChar = m;
  return m;
}

/**
 * Real HSK words containing this character, shortest first.
 *
 * Shortest first because a two-character word is the smallest honest unit of
 * written Chinese — it is the form the character is most often met in, and the
 * one a learner can read before they can read a clause.
 */
export function wordsContaining(hanzi: string, limit = 3): string[] {
  if (hanzi.length !== 1) return [];
  const all = index().get(hanzi) ?? [];
  return [...all].sort((a, b) => a.length - b.length || all.indexOf(a) - all.indexOf(b)).slice(0, limit);
}

export interface ReadingContext {
  /** What to put on screen. */
  display: string;
  /** Where the character under test sits inside `display`. */
  at: number;
  /** False when the character is shown alone, with nothing to see past. */
  embedded: boolean;
}

/** Strength at which a character stops being shown on its own. */
export const EMBED_FROM_STRENGTH = 2;

/**
 * How to present this character for a recognition test.
 *
 * Falls back to showing it alone whenever there is nothing honest to embed it
 * in — a multi-character card is already its own context, and a character with
 * no HSK word to its name has nowhere to hide. Never invents a word.
 */
export function contextFor(
  hanzi: string,
  rec: SeenRecord | undefined,
  { force }: { force?: "isolated" | "embedded" } = {},
): ReadingContext {
  const alone: ReadingContext = { display: hanzi, at: 0, embedded: false };
  if (hanzi.length !== 1) return alone;      // a word is already context
  if (force === "isolated") return alone;

  const strongEnough = strengthOf(rec) >= EMBED_FROM_STRENGTH;
  if (!strongEnough && force !== "embedded") return alone;

  const word = wordsContaining(hanzi, 1)[0];
  if (!word) return alone;

  const at = word.indexOf(hanzi);
  return at === -1 ? alone : { display: word, at, embedded: true };
}
