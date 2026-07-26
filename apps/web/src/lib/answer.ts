import { normalizePinyin } from "./pinyin";

// Write-mode answer checking.
//
// The prompt is the English meaning, and either the characters or their
// reading counts as a correct answer. We report *which* one was given rather
// than a bare pass/fail, because they aren't equally hard: reproducing 茶 from
// "tea" is the thing this app exists to teach, while producing "cha" is a
// step short of it. The caller decides what that difference is worth.

export type AnswerKind = "hanzi" | "pinyin" | null;

/**
 * Which form of the answer the input matches, or null if neither.
 *
 * Hanzi must match exactly (whitespace aside). Pinyin is compared on letters
 * only — tone marks, tone digits, spacing and apostrophes are all ignored, so
 * "ni hao", "nǐhǎo" and "ni3hao3" are equally acceptable. Requiring tone marks
 * would fail people typing on a keyboard that can't produce them.
 */
export function checkAnswer(input: string, card: { hanzi: string; pinyin: string }): AnswerKind {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.replace(/\s+/g, "") === card.hanzi.replace(/\s+/g, "")) return "hanzi";

  const got = normalizePinyin(trimmed).letters;
  const want = normalizePinyin(card.pinyin).letters;
  if (got && want && got === want) return "pinyin";

  return null;
}
