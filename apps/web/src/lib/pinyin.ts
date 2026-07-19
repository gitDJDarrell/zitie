/* ————————————————— pinyin normalization ————————————————— */
const TONE_MAP: Record<string, [string, number]> = {
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  "ǖ": ["v", 1], "ǘ": ["v", 2], "ǚ": ["v", 3], "ǜ": ["v", 4],
  "ü": ["v", 0],
};

// Returns { letters: "nihao", tones: [3,3] } — tone 0/5 (neutral) stripped
export function normalizePinyin(str: string) {
  let letters = "";
  const tones: number[] = [];
  for (const raw of (str || "").toLowerCase().normalize("NFC")) {
    if (TONE_MAP[raw]) {
      letters += TONE_MAP[raw][0];
      if (TONE_MAP[raw][1] > 0) tones.push(TONE_MAP[raw][1]);
    } else if (raw >= "1" && raw <= "4") {
      tones.push(Number(raw));
    } else if (raw === "5" || raw === "0") {
      // neutral tone marker — ignored
    } else if (raw >= "a" && raw <= "z") {
      letters += raw;
    }
    // spaces, apostrophes, everything else: dropped
  }
  return { letters: letters.replace(/u:/g, "v"), tones };
}
