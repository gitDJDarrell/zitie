import { LOOKALIKE_ROWS } from "../data/lookalikes";

/* ————————————— characters that are easy to misread —————————————
   Zitie is for reading Chinese you meet in the wild, and reading in the wild
   fails on look-alikes: 木/本 on a sign, 未/末 in a menu, 日/曰 in a subtitle.
   Read mode's distractors used to be ranked on part of speech and gloss length
   alone, so a learner who could tell 茶 from "to run" passed — and was never
   asked the only question a sign actually poses.

   The map is generated, not hand-written: apps/api/scripts/build-lookalikes.ts
   ranks every dex character against every other by how far their inked areas
   coincide, using the same makemeahanzi stroke medians brush mode grades
   against. That generator carries the argument for geometry over the `radical`
   and `strokes` already on the Card — briefly, the pairs that break reading are
   mostly filed under different radicals, which is often the entire difference
   between them (土/士, 日/曰, 我/找), while a shared radical catches 咖 吃 叫,
   which nobody confuses.

   Bundled rather than fetched: meaningChoices is called synchronously inside a
   useMemo during render, and StudyView reads its result again to decide whether
   read mode is a quiz at all before the session starts. An async source would
   have to ripple through both, and the offline failure would be silent — not a
   visible degradation like brush mode falling back to freehand, but distractors
   quietly reverting to the weaker test with nothing on screen to say so. */

/** hanzi -> its look-alikes, most alike first. Parsed once, on first use. */
let rows: Map<string, string> | null = null;

function table(): Map<string, string> {
  if (!rows) {
    rows = new Map();
    // Split on either line ending. The generator writes LF, but this repo
    // checks out with core.autocrlf on Windows, and a stray \r would ride along
    // as an eleventh "look-alike" — harmless to match against, but enough to
    // make a list-length check fail on one platform and pass on another.
    for (const row of LOOKALIKE_ROWS.split(/\r?\n/)) {
      if (row.length > 1) rows.set(row[0], row.slice(1));
    }
  }
  return rows;
}

/**
 * The look-alikes of a single character, most alike first — "" when it has
 * none, which is true of 48 dex characters that resemble nothing closely.
 *
 * This is the *listed* set, capped by the generator. Ask `looksLike` rather
 * than this when the question is whether two characters are confusable: the cap
 * can drop a pair from one side's list while keeping it on the other's.
 */
export function lookAlikesOf(hanzi: string): string {
  return table().get(hanzi) ?? "";
}

/** Whether two single characters are confusable, in either direction. */
function confusable(a: string, b: string): boolean {
  return lookAlikesOf(a).includes(b) || lookAlikesOf(b).includes(a);
}

/**
 * Whether `b` is a plausible misreading of `a`.
 *
 * Both sides are read as whole card hanzi, which may be words rather than
 * single characters: a word is misread when exactly one of its characters is
 * misread and every other position lines up — 末来 for 未来. A different length,
 * or two characters wrong at once, and you are not misreading the word, you are
 * reading a different one. That second rule earns its keep — 未来 and 末末 pass
 * character by character, because 来 and 末 are themselves confusable, but
 * needing two independent slips at once is not the failure this is testing for.
 */
export function looksLike(a: string, b: string): boolean {
  if (a === b) return false;
  const left = [...a], right = [...b];
  if (left.length !== right.length) return false;

  let misread = -1;
  for (let i = 0; i < left.length; i++) {
    if (left[i] === right[i]) continue;
    if (misread >= 0) return false;             // a second slip; different word
    misread = i;
  }
  return misread >= 0 && confusable(left[misread], right[misread]);
}
