import { DEX_LEVELS } from "../data/dex.js";
import { WORD_DEX_LEVELS, WORD_ORDER } from "../data/wordDex.js";

/* ————————————————— card packs: rating and rolls —————————————————
   Two independent axes per card. TIER is HSK level — what pool a card is
   drawn from. RARITY is prestige, and it is computed *within* a tier so
   every level has its own legendaries: a HSK 1 learner can pull 不 and use
   it that afternoon, instead of being handed a HSK 7-9 trophy they cannot
   read.

   Rarity is cosmetic. It selects the card's material treatment (paper, ink,
   satin, mirror) and nothing else — every card carries identical content,
   because no learner should be denied the material that teaches a character
   by a dice roll. See DESIGN-PACKS.md. */

export type Rarity = "common" | "rare" | "epic" | "legendary";

// Ascending, so RARITY_ORDER.indexOf() doubles as a comparable grade.
export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

/** Share of each tier, from the top down. Cumulative: 3% / 10% / 50% / 100%. */
export const RARITY_CUT: { rarity: Rarity; upTo: number }[] = [
  { rarity: "legendary", upTo: 0.03 },
  { rarity: "epic", upTo: 0.10 },
  { rarity: "rare", upTo: 0.50 },
  { rarity: "common", upTo: 1.00 },
];

export const PACK_SIZE = 16;
export const PITY_EPIC = 5;
export const PITY_LEGENDARY = 20;

/** Points a duplicate converts to, mirroring OW1's credit floor on dupes. */
export const DUPE_VALUE: Record<Rarity, number> = {
  common: 5, rare: 15, epic: 50, legendary: 200,
};

export const PACK_COST: Record<Rarity, number> = {
  common: 150, rare: 400, epic: 900, legendary: 2000,
};

/** Points come only from proving cards. Opening a pack earns nothing —
    hoarding unstudied cards has to be worthless, or the loop inverts. */
export type PointEvent = "review" | "proof" | "mastery" | "streak";
export const POINTS: Record<PointEvent, number> = {
  review: 1, proof: 5, mastery: 25, streak: 20,
};

export function pointsFor(events: PointEvent[]): number {
  return events.reduce((sum, e) => sum + (POINTS[e] ?? 0), 0);
}

/** Floor each pack grade guarantees, as [rarity, count]. */
export const PACK_FLOOR: Record<Rarity, { rarity: Rarity; count: number }> = {
  common: { rarity: "epic", count: 1 },
  rare: { rarity: "epic", count: 2 },
  epic: { rarity: "legendary", count: 1 },
  legendary: { rarity: "legendary", count: 3 },
};

export interface Rating {
  hanzi: string;
  tier: string;
  /** HSK words this character appears in — the closest thing to power level. */
  yield: number;
  rarity: Rarity;
}

let RATINGS: Map<string, Rating> | null = null;
let WORD_RATINGS: Map<string, Rating> | null = null;

function charYields(): Map<string, number> {
  const y = new Map<string, number>();
  for (const level of DEX_LEVELS) for (const c of level.chars) if (c.trim()) y.set(c, 0);
  for (const word of WORD_ORDER) {
    // Count each character once per word, not once per occurrence — 爸爸
    // must not score 爸 twice.
    for (const c of new Set([...word])) {
      const prev = y.get(c);
      if (prev !== undefined) y.set(c, prev + 1);
    }
  }
  return y;
}

/** Assign rarities to one tier's members, ranked by score descending.
    Ties break on codepoint so the rating is stable across runs — a rarity
    that reshuffles between builds would silently restyle collected cards. */
function gradeTier<T>(members: T[], key: (m: T) => string, score: (m: T) => number): Map<string, Rarity> {
  const ranked = [...members].sort((a, b) => {
    const d = score(b) - score(a);
    return d !== 0 ? d : key(a).codePointAt(0)! - key(b).codePointAt(0)!;
  });
  const out = new Map<string, Rarity>();
  const n = ranked.length;
  ranked.forEach((m, i) => {
    const cut = RARITY_CUT.find(c => i < Math.round(n * c.upTo)) ?? RARITY_CUT[RARITY_CUT.length - 1];
    out.set(key(m), cut.rarity);
  });
  return out;
}

function buildRatings(): Map<string, Rating> {
  const y = charYields();
  const out = new Map<string, Rating>();
  for (const level of DEX_LEVELS) {
    const chars = [...level.chars].filter(c => c.trim());
    const grades = gradeTier(chars, c => c, c => y.get(c) ?? 0);
    for (const c of chars) {
      out.set(c, { hanzi: c, tier: level.id, yield: y.get(c) ?? 0, rarity: grades.get(c)! });
    }
  }
  return out;
}

function buildWordRatings(): Map<string, Rating> {
  const y = charYields();
  // A word's score is the mean yield of its characters: how central its
  // ingredients are to the language. This keeps words on the same axis as
  // characters (central = prized), so 咖啡 grades low — two phonetic-only
  // characters that appear in almost nothing else — while a word built from
  // workhorse characters grades high.
  const meanYield = (w: string) => {
    const cs = [...w];
    return cs.reduce((s, c) => s + (y.get(c) ?? 0), 0) / (cs.length || 1);
  };
  const out = new Map<string, Rating>();
  for (const level of WORD_DEX_LEVELS) {
    const grades = gradeTier(level.words, w => w, meanYield);
    for (const w of level.words) {
      out.set(w, { hanzi: w, tier: level.id, yield: Math.round(meanYield(w)), rarity: grades.get(w)! });
    }
  }
  return out;
}

export function ratingOf(hanzi: string): Rating | undefined {
  RATINGS ??= buildRatings();
  return RATINGS.get(hanzi);
}

export function wordRatingOf(word: string): Rating | undefined {
  WORD_RATINGS ??= buildWordRatings();
  return WORD_RATINGS.get(word);
}

export function rarityOf(hanzi: string): Rarity | undefined {
  return ratingOf(hanzi)?.rarity;
}

/** Every character in a tier, grouped by rarity — the draw pool. */
export function poolFor(tier: string, rarity: Rarity): string[] {
  RATINGS ??= buildRatings();
  const out: string[] = [];
  for (const r of RATINGS.values()) if (r.tier === tier && r.rarity === rarity) out.push(r.hanzi);
  return out.sort();
}

export interface RollOptions {
  grade: Rarity;
  /** The learner's current HSK level id. */
  tier: string;
  rng?: () => number;
  /** Packs opened since the last epic / legendary, for the pity timers. */
  sinceEpic?: number;
  sinceLegendary?: number;
}

export interface RollResult {
  cards: Rating[];
  sinceEpic: number;
  sinceLegendary: number;
}

const BAND_NEXT_CHANCE = 0.2;

function nextTier(tier: string): string {
  const i = DEX_LEVELS.findIndex(l => l.id === tier);
  return i >= 0 && i < DEX_LEVELS.length - 1 ? DEX_LEVELS[i + 1].id : tier;
}

function rollRarity(rng: () => number): Rarity {
  // RARITY_CUT is cumulative from the top, so a single roll against the
  // running boundary reproduces the same 3/7/40/50 split the tiers use.
  const r = rng();
  for (const cut of RARITY_CUT) if (r < cut.upTo) return cut.rarity;
  return "common";
}

/** Roll one pack. Pure given `rng`, so a seeded generator makes it replayable. */
export function rollPack(opts: RollOptions): RollResult {
  const rng = opts.rng ?? Math.random;
  const sinceEpic = opts.sinceEpic ?? 0;
  const sinceLegendary = opts.sinceLegendary ?? 0;

  const rarities: Rarity[] = [];
  for (let i = 0; i < PACK_SIZE; i++) rarities.push(rollRarity(rng));

  // Apply the grade's floor, then the pity timers on top. Both work by
  // upgrading the weakest slots, so a pack never shrinks to meet a promise.
  const floors: { rarity: Rarity; count: number }[] = [opts.grade ? PACK_FLOOR[opts.grade] : PACK_FLOOR.common];
  if (sinceEpic + 1 >= PITY_EPIC) floors.push({ rarity: "epic", count: 1 });
  if (sinceLegendary + 1 >= PITY_LEGENDARY) floors.push({ rarity: "legendary", count: 1 });

  for (const floor of floors) {
    const grade = RARITY_ORDER.indexOf(floor.rarity);
    let have = rarities.filter(r => RARITY_ORDER.indexOf(r) >= grade).length;
    while (have < floor.count) {
      let weakest = 0;
      for (let i = 1; i < rarities.length; i++) {
        if (RARITY_ORDER.indexOf(rarities[i]) < RARITY_ORDER.indexOf(rarities[weakest])) weakest = i;
      }
      rarities[weakest] = floor.rarity;
      have++;
    }
  }

  const cards: Rating[] = [];
  const taken = new Set<string>();
  for (const rarity of rarities) {
    // 80/20 band: mostly the current tier, with a taste of what is next.
    const useNext = rng() < BAND_NEXT_CHANCE;
    const tiers = useNext ? [nextTier(opts.tier), opts.tier] : [opts.tier, nextTier(opts.tier)];
    let picked: Rating | undefined;
    for (const tier of tiers) {
      const pool = poolFor(tier, rarity).filter(h => !taken.has(h));
      if (pool.length) {
        const hanzi = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
        picked = ratingOf(hanzi);
        break;
      }
    }
    if (picked) {
      taken.add(picked.hanzi);
      cards.push(picked);
    }
  }

  const gotEpic = cards.some(c => RARITY_ORDER.indexOf(c.rarity) >= 2);
  const gotLegendary = cards.some(c => c.rarity === "legendary");
  return {
    cards,
    sinceEpic: gotEpic ? 0 : sinceEpic + 1,
    sinceLegendary: gotLegendary ? 0 : sinceLegendary + 1,
  };
}
