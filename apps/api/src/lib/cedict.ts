// Parsing for the two reference corpora behind the pre-seeded bank: CC-CEDICT
// (word → pinyin + English) and the official HSK 3.0 word list (word → level,
// and sometimes a part of speech). Kept pure and separate from the build
// script so the fiddly parts — tone marks especially — can be tested.

/** A dictionary entry, normalised to what a card needs. */
export interface DictEntry {
  zh: string;
  /** Pinyin with tone marks, e.g. "àihào". */
  py: string;
  /** English gloss, senses separated by "; ". */
  en: string;
}

const VOWELS: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"], e: ["ē", "é", "ě", "è"], i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"], u: ["ū", "ú", "ǔ", "ù"], "ü": ["ǖ", "ǘ", "ǚ", "ǜ"],
};

/**
 * One numbered syllable ("hao3", "lu:4", "ma5") to tone marks. The mark goes
 * on a/o/e when present, on the second vowel of "iu"/"ui", otherwise on the
 * only vowel — the standard placement rule.
 */
export function syllableToneMarks(syllable: string): string {
  const match = /^([a-zA-ZüÜ:]+)([1-5])?$/.exec(syllable.replace(/u:/g, "ü").replace(/U:/g, "Ü"));
  if (!match) return syllable;
  const [, letters, toneDigit] = match;
  const tone = Number(toneDigit ?? 5);
  if (tone === 5 || !toneDigit) return letters.toLowerCase();

  const lower = letters.toLowerCase();
  let index = -1;
  for (const v of ["a", "o", "e"]) {
    const at = lower.indexOf(v);
    if (at !== -1) { index = at; break; }
  }
  if (index === -1) {
    // "iu" and "ui": the tone sits on the second vowel.
    const pair = /(iu|ui)/.exec(lower);
    if (pair) index = pair.index + 1;
    else index = [...lower].findIndex((c) => c in VOWELS);
  }
  if (index === -1) return lower;
  const marked = VOWELS[lower[index]]?.[tone - 1];
  return marked ? lower.slice(0, index) + marked + lower.slice(index + 1) : lower;
}

/**
 * A whole CC-CEDICT pinyin field ("ai4 hao4") to tone marks ("àihào").
 * Syllables run together the way a dictionary prints a single word; an
 * apostrophe goes in where a vowel-initial syllable would otherwise be
 * misread (xi'an, not xian).
 */
export function toneMarks(numbered: string): string {
  const syllables = numbered.trim().split(/\s+/).filter(Boolean).map(syllableToneMarks);
  return syllables.reduce((out, syl, i) => {
    if (i === 0) return syl;
    const needsApostrophe = /^[aāáǎàoōóǒòeēéěè]/.test(syl);
    return out + (needsApostrophe ? "'" : "") + syl;
  }, "");
}

/**
 * A sense that only names a place, a person or a surname. CC-CEDICT lists
 * these alongside ordinary senses — 药水 is a river in North Korea before it
 * is medicine — and on a flashcard the proper noun is almost never the sense
 * the learner wants, so it sorts last rather than being dropped.
 */
function isProperNoun(sense: string): boolean {
  return /^[A-Z]/.test(sense) || /\bsurname\b|\bprovince\b|\bcounty\b|\bdynasty\b/i.test(sense);
}

/**
 * The senses worth showing, in the order to show them: cross-references and
 * classifiers dropped, ordinary senses ahead of proper nouns, duplicates
 * removed.
 */
export function usableSenses(senses: string[]): string[] {
  const useful = senses
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("CL:") && !/^see( also)? /i.test(s) && !/^variant of /i.test(s)
      && !/^old variant of /i.test(s) && !/^abbr\. for /i.test(s))
    // Strip the bracketed pinyin CEDICT puts after a referenced word.
    .map((s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [...new Set([...useful.filter((s) => !isProperNoun(s)), ...useful.filter(isProperNoun)])];
}

/**
 * CC-CEDICT glosses, cleaned for a flashcard: cross-reference and classifier
 * entries dropped, ordinary senses ahead of proper nouns, trimmed to `max`
 * characters.
 */
export function cleanGloss(senses: string[], max = 90): string {
  const deduped = usableSenses(senses);
  if (!deduped.length) return "";

  let out = deduped[0];
  for (const sense of deduped.slice(1)) {
    if (`${out}; ${sense}`.length > max) break;
    out += `; ${sense}`;
  }
  return out.length <= max ? out : `${out.slice(0, max - 1).trimEnd()}…`;
}

/**
 * One CC-CEDICT line: "愛好 爱好 [ai4 hao4] /to like/hobby/". Returns the
 * simplified form only — the app is simplified-only throughout — with senses
 * left raw for the caller to merge.
 */
export function parseCedictLine(line: string): { zh: string; py: string; senses: string[] } | null {
  const match = /^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\/\s*$/.exec(line);
  if (!match) return null;
  const [, , simplified, pinyin, glosses] = match;
  return { zh: simplified, py: toneMarks(pinyin), senses: glosses.split("/") };
}

/**
 * Simplified-form index of a whole CC-CEDICT file. A word often has several
 * entries: senses of the *same* reading are merged (which is what rescues
 * words whose first-listed sense is a place name), while a different reading
 * is a different word and is left alone.
 */
/** Every reading a word has in the file, senses of one reading merged. */
export function parseCedictReadings(text: string): Map<string, { py: string; senses: string[] }[]> {
  const collected = new Map<string, { py: string; senses: string[] }[]>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parsed = parseCedictLine(line);
    if (!parsed) continue;
    const readings = collected.get(parsed.zh) ?? [];
    const sameReading = readings.find((r) => r.py === parsed.py);
    if (sameReading) sameReading.senses.push(...parsed.senses);
    else readings.push({ py: parsed.py, senses: parsed.senses });
    collected.set(parsed.zh, readings);
  }
  return collected;
}

/**
 * Simplified-form index of a whole CC-CEDICT file, one entry per word.
 *
 * Picking the right reading is the hard part. File order doesn't give it —
 * CC-CEDICT lists 打 as dá ("a dozen") before dǎ ("to hit"), and 吗's first
 * reading is only a pointer to 吗啡, morphine. `preferred` (a word → pinyin
 * map, from a usage-ranked source) settles it where it has an opinion;
 * otherwise the reading with the most recorded senses wins, which is a decent
 * proxy for the one the language actually uses.
 *
 * The gloss always comes from the chosen reading, so pinyin and meaning
 * describe the same word.
 */
export function parseCedict(text: string, preferred?: Map<string, string>): Map<string, DictEntry> {
  const byWord = new Map<string, DictEntry>();

  for (const [zh, readings] of parseCedictReadings(text)) {
    const usable = readings
      .map((r) => ({ py: r.py, senses: usableSenses(r.senses) }))
      .filter((r) => r.senses.length > 0);
    if (!usable.length) continue;

    const want = preferred?.get(zh);
    const chosen = usable.find((r) => r.py === want)
      ?? [...usable].sort((a, b) => b.senses.length - a.senses.length)[0];
    byWord.set(zh, { zh, py: chosen.py, en: cleanGloss(chosen.senses) });
  }
  return byWord;
}

export interface HskWord {
  zh: string;
  /** Earliest level the form is examinable at — "1".."6" or "7-9". */
  level: string;
  /** Every level it is listed at; 打 is examinable at three of them. */
  levels: string[];
  /** Parts of speech the standard annotates, e.g. 白（形） → ["adjective"]. */
  pos: string[];
}

// The standard annotates a word's part of speech only where it disambiguates
// two entries with the same characters.
const POS_LABEL: Record<string, string> = {
  名: "noun", 动: "verb", 形: "adjective", 副: "adverb", 量: "measure word",
  代: "pronoun", 介: "preposition", 连: "conjunction", 助: "particle",
  数: "numeral", 叹: "interjection", 拟声: "onomatopoeia", 拟: "onomatopoeia",
  头: "prefix", 尾: "suffix", 缀: "affix",
};

const LEVEL_HEADERS: [RegExp, string][] = [
  [/^一级/, "1"], [/^二级/, "2"], [/^三级/, "3"], [/^四级/, "4"],
  [/^五级/, "5"], [/^六级/, "6"], [/^七/, "7-9"],
];

/**
 * The official list, one row per written form. Entries carry two kinds of
 * annotation: 「爸爸｜爸」 is one item with two accepted forms (both listed,
 * both examinable), and 「白（形）」 marks which sense of a repeated word this
 * entry is.
 *
 * A form listed more than once — 打 appears at three levels as three senses —
 * is merged rather than dropped: earliest level first (that's when a learner
 * meets it), every level it appears at recorded, parts of speech unioned.
 */
export function parseHskWordlist(text: string): HskWord[] {
  const words = new Map<string, HskWord>();
  let level = "1";

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const header = LEVEL_HEADERS.find(([re]) => re.test(line));
    if (header && line.includes("级词汇表")) { level = header[1]; continue; }

    const entry = /^\d+\s+(.+)$/.exec(line);
    if (!entry) continue;

    const pos: string[] = [];
    const body = entry[1]
      .replace(/（([^）]*)）/g, (_, note: string) => {
        for (const [zh, label] of Object.entries(POS_LABEL)) {
          if (note.includes(zh) && !pos.includes(label)) pos.push(label);
        }
        return "";
      })
      // 称¹ / 称² number the senses of a repeated word; the written form is
      // the same, and merging below keeps both senses' levels.
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, "")
      .trim();

    for (const form of body.split(/[｜|]/).map((f) => f.trim()).filter(Boolean)) {
      const existing = words.get(form);
      if (!existing) {
        words.set(form, { zh: form, level, levels: [level], pos: [...pos] });
        continue;
      }
      if (!existing.levels.includes(level)) existing.levels.push(level);
      for (const label of pos) if (!existing.pos.includes(label)) existing.pos.push(label);
    }
  }
  return [...words.values()];
}
