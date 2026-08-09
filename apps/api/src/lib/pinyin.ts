/* ————————————————— pinyin → Azure SSML phoneme —————————————————

   The reason this file exists is not voice quality. It is that a bare hanzi
   handed to any TTS engine is a guess whenever the character has more than one
   reading, and Mandarin has hundreds that do: 行 is xíng or háng, 还 is hái or
   huán, 好 is hǎo or hào. The engine picks by context, and a flashcard has no
   context — so the app would confidently teach the wrong tone, which is worse
   than teaching nothing. No amount of neural voice fixes that.

   Every card already stores the reading it means. Azure's Chinese SSML takes
   pinyin directly — <phoneme alphabet="sapi" ph="xing2">行</phoneme> — so the
   fix is to stop letting the engine choose. This converts the stored,
   tone-marked pinyin into that form.

   It refuses rather than guesses. A reading it cannot parse confidently
   returns null and the caller skips the clip, leaving the character silent.
   Silence is recoverable; a wrong tone drilled twenty times is not. */

const TONE_MARKS: Record<string, [string, number]> = {
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  "ǖ": ["v", 1], "ǘ": ["v", 2], "ǚ": ["v", 3], "ǜ": ["v", 4],
  "ü": ["v", 0], "ń": ["n", 2], "ň": ["n", 3], "ǹ": ["n", 4],
};

// Longest first, so the parser prefers zh/ch/sh over z/c/s.
const INITIALS = [
  "zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l",
  "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w",
];

const FINALS = [
  "iang", "iong", "uang", "ueng", "ang", "eng", "ing", "ong", "iao", "ian",
  "uai", "uan", "van", "ai", "ei", "ao", "ou", "an", "en", "er", "ia", "ie",
  "iu", "in", "ua", "uo", "ui", "un", "ve", "vn", "a", "o", "e", "i", "u", "v",
].sort((a, b) => b.length - a.length);

/** Strip tone marks, returning the bare letters and the tone per syllable position. */
function stripTones(raw: string): { letters: string; tones: Map<number, number> } {
  let letters = "";
  const tones = new Map<number, number>();
  for (const ch of raw.toLowerCase().normalize("NFC")) {
    const marked = TONE_MARKS[ch];
    if (marked) {
      // The tone belongs to the syllable this vowel sits in; record where.
      if (marked[1] > 0) tones.set(letters.length, marked[1]);
      letters += marked[0];
    } else if (ch >= "1" && ch <= "5") {
      // Numeric notation: the digit trails the syllable it belongs to.
      tones.set(letters.length - 1, Number(ch) === 5 ? 0 : Number(ch));
    } else if (ch >= "a" && ch <= "z") {
      letters += ch;
    } else if (ch === ":") {
      letters = letters.replace(/u$/, "v"); // u: is a plain-ASCII ü
    }
    // spaces, apostrophes, hyphens: dropped, but see splitSyllables
  }
  return { letters, tones };
}

/**
 * Split bare pinyin letters into syllables.
 *
 * A full parse or nothing. It backtracks rather than committing to a greedy
 * longest-first split, so a choice that strands an unparseable tail is undone
 * instead of failing the whole reading.
 *
 * On real HSK readings greedy would in fact agree — I checked eighteen and
 * found no disagreement — so this is insurance, not a fix for an observed bug.
 * It is cheap insurance: syllables are short, the search is bounded by the
 * length of one reading, and the alternative is a silent wrong split on some
 * input nobody thought to try.
 */
function splitSyllables(letters: string): string[] | null {
  const out: string[] = [];

  const walk = (at: number): boolean => {
    if (at === letters.length) return true;
    for (const initial of ["", ...INITIALS]) {
      if (initial && !letters.startsWith(initial, at)) continue;
      const afterInitial = at + initial.length;
      for (const final of FINALS) {
        if (!letters.startsWith(final, afterInitial)) continue;
        out.push(initial + final);
        if (walk(afterInitial + final.length)) return true;
        out.pop();
      }
    }
    return false;
  };

  return walk(0) ? out : null;
}

/**
 * The stored reading as an Azure `sapi` phoneme string — "xing2", "ni3 hao3".
 *
 * Null when the reading can't be parsed into syllables, so the caller can skip
 * the clip instead of shipping a guess. Untoned syllables get 5, Azure's
 * neutral tone, which is what an unmarked pinyin syllable actually means.
 */
export function toPhoneme(pinyin: string): string | null {
  if (!pinyin?.trim()) return null;

  // Honour separators the source already provides rather than re-deriving
  // boundaries it has told us about.
  const chunks = pinyin.trim().split(/[\s·'’\-]+/).filter(Boolean);
  const syllables: string[] = [];

  for (const chunk of chunks) {
    const { letters, tones } = stripTones(chunk);
    if (!letters) return null;
    const split = splitSyllables(letters);
    if (!split) return null;

    let at = 0;
    for (const syllable of split) {
      // The tone recorded anywhere inside this syllable's span is its tone.
      let tone = 0;
      for (let i = at; i < at + syllable.length; i++) {
        const found = tones.get(i);
        if (found !== undefined) { tone = found; break; }
      }
      syllables.push(`${syllable}${tone || 5}`);
      at += syllable.length;
    }
  }

  return syllables.length ? syllables.join(" ") : null;
}

/** XML-escape text destined for an SSML document. */
function esc(s: string): string {
  return s.replace(/[<>&'"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/**
 * SSML for one utterance, with the reading pinned when we know it.
 *
 * Slightly under normal speed: these are study prompts, and a tone is easier
 * to hear held than rushed.
 */
export function toSsml(
  hanzi: string,
  pinyin: string,
  voice = "zh-CN-XiaoxiaoNeural",
  rate = "-10%",
): string {
  const ph = toPhoneme(pinyin);
  const body = ph
    ? `<phoneme alphabet="sapi" ph="${esc(ph)}">${esc(hanzi)}</phoneme>`
    : esc(hanzi);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" `
    + `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">`
    + `<voice name="${esc(voice)}"><prosody rate="${esc(rate)}">${body}</prosody></voice></speak>`;
}
