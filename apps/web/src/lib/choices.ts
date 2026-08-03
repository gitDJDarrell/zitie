import type { Card } from "../types";

/* ————————————— multiple-choice distractors —————————————
   Read mode used to be tap-to-flip and self-rate, which is fine for revision
   but proves nothing: you cannot tell "I knew it" from "I thought I knew it"
   after seeing the answer. Picking the meaning out of a set makes the same
   card an actual test, which is what earns it a dex slot.

   Distractors have to be plausible or the test is free. The ranking below
   prefers wrong answers that are hard to rule out on shape alone: same part of
   speech first, then a similar length of gloss, so the right answer is never
   the odd one out. */

export const CHOICE_COUNT = 4;

const CJK = /[一-鿿]/;
// "used in 咖啡 (coffee)", with or without a leading dash and the gloss.
const USED_IN = /\s*[—–-]?\s*used in\s+[一-鿿]+\s*(?:\(([^)]*)\))?/gi;

/**
 * A meaning as it can safely be offered as an answer.
 *
 * Bound forms are glossed by the word they live in — 啡 is "used in 咖啡
 * (coffee)" — and that is a usage note, not a meaning. Offered verbatim it
 * printed the character under test inside its own correct answer, so the
 * question could be answered by matching glyphs without reading anything. The
 * context prompt made it worse: once 啡 is shown as 咖啡, the right option
 * repeated the prompt exactly.
 *
 * So the usage note is unwrapped to the English it was carrying, and any
 * remaining hanzi is dropped. Applied to every option, never just the correct
 * one — sanitising only the answer would swap a glyph-matching tell for a
 * formatting one.
 */
export function optionGloss(meaning: string): string {
  let carried = "";
  const stripped = meaning.replace(USED_IN, (_m, gloss: string | undefined) => {
    if (gloss) carried = gloss;
    return "";
  });

  const tidy = (s: string) => s.replace(CJK_RUN, "").replace(/\s+/g, " ")
    .replace(/^[\s;,—–-]+|[\s;,—–-]+$/g, "").trim();

  // Each fallback is itself hanzi-free, so no path out of here can leak one.
  // The last resort — a gloss written entirely in hanzi — has nothing safe to
  // return, and meaningChoices refuses the whole option set rather than ship it.
  return tidy(stripped) || tidy(carried) || tidy(meaning) || meaning.trim();
}

const CJK_RUN = /[一-鿿]+/g;

/** Meanings that are effectively the same answer, so never offered together. */
function key(meaning: string): string {
  return meaning.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z ]/g, "").trim();
}

function overlaps(a: string, b: string): boolean {
  const ka = key(a), kb = key(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/**
 * How good a distractor `other` is for `card` — lower sorts first. Same part
 * of speech is the strongest signal (a verb among three nouns gives the answer
 * away), then a gloss of similar length.
 */
function distance(card: Card, other: Card): number {
  const shared = other.pos.some(p => card.pos.includes(p));
  const lengthGap = Math.abs(other.meaning.length - card.meaning.length) / 40;
  return (shared ? 0 : 1) + Math.min(lengthGap, 0.9);
}

/**
 * The options for one card: its own meaning plus up to `count - 1` distractors
 * drawn from the rest of the bank, shuffled. Returns an empty array when the
 * bank can't field enough plausible wrong answers — the caller falls back to
 * the classic flip rather than showing a two-option coin toss.
 *
 * `rand` is injectable so the shuffle is testable; it must behave like
 * Math.random (0 ≤ r < 1).
 */
export function meaningChoices(
  card: Card,
  bank: Card[],
  count = CHOICE_COUNT,
  rand: () => number = Math.random,
): string[] {
  const wanted = count - 1;
  const seen = new Set<string>();
  const pool = bank
    .filter(c => c.id !== card.id && c.meaning.trim() && !overlaps(c.meaning, card.meaning))
    .filter(c => (seen.has(key(c.meaning)) ? false : (seen.add(key(c.meaning)), true)))
    .sort((a, b) => distance(card, a) - distance(card, b));

  if (pool.length < wanted) return [];

  // Take from the closest half so the options stay plausible, but not always
  // the same three: a card studied twice in one session shouldn't be a memory
  // test of the option list rather than of the character.
  const near = pool.slice(0, Math.max(wanted, Math.ceil(pool.length / 2)));
  const distractors = pick(near, wanted, rand).map(c => c.meaning);
  const options = shuffle([card.meaning, ...distractors], rand).map(optionGloss);

  // Belt and braces: an option that still carries a hanzi could hand over the
  // answer by matching the prompt, so refuse the whole set rather than ship a
  // free question. The caller falls back to tap-to-flip.
  return options.some(o => CJK.test(o)) ? [] : options;
}

/**
 * Whether a chosen option is this card's answer.
 *
 * Lives here rather than at the call sites because options are sanitised on
 * the way out: comparing a tapped option against the raw `card.meaning` looks
 * right and silently marks every bound form wrong.
 */
export function isAnswer(option: string, card: Card): boolean {
  return option === optionGloss(card.meaning);
}

/** `n` distinct items, chosen uniformly without replacement. */
function pick<T>(items: T[], n: number, rand: () => number): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (out.length < n && rest.length) {
    out.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  }
  return out;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
