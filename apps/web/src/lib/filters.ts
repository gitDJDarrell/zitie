import type { Card, SeenMap } from "../types";
import { normalizePinyin } from "./pinyin";

export const DAY = 24 * 60 * 60 * 1000;

export interface Filters {
  q: string;
  pos: string[];
  includeCompound: boolean;
  age: "all" | "new" | "old";
  starred: boolean;
}

export function applyFilters(bank: Card[], srs: SeenMap, f: Filters) {
  return bank.filter(c => {
    if (!f.includeCompound && c.compound) return false;
    if (f.starred && !c.starred) return false;
    if (f.pos.length && !c.pos.some(p => f.pos.includes(p))) return false;
    if (f.age === "new" && srs[c.id]) return false;
    if (f.age === "old" && !srs[c.id]) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const pinyinFlat = normalizePinyin(c.pinyin).letters;
      const qFlat = normalizePinyin(q).letters;
      const hit = c.hanzi.includes(f.q)
        || (qFlat && pinyinFlat.includes(qFlat))
        || c.meaning.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}
