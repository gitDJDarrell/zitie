// Single-character hanzi glyphs for the part-of-speech tags used across the
// bank (seed data + the AI extractor's prompt) — purely cosmetic prefixes for
// filter chips, matching the app's bilingual-label convention (课 lesson,
// 图鉴 dex, etc). Unmapped/custom pos values just render without a glyph.
export const POS_HANZI: Record<string, string> = {
  noun: "名",
  verb: "动",
  pronoun: "代",
  adjective: "形",
  adverb: "副",
  "measure word": "量",
  particle: "助",
  "bound form": "粘",
  preposition: "介",
  numeral: "数",
  conjunction: "连",
  interjection: "叹",
  prefix: "前",
  suffix: "后",
};
