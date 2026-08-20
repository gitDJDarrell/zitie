import { DEX_LEVELS } from "../data/dexLevels.js";

/* ————————————————— card rating and pack rolls (server) —————————————————
   The authoritative half of apps/web/src/lib/packs.ts. Rolling has to happen
   here — a client that rolls its own legendaries is not playing a game — and
   rarity is stamped onto the card row at grant time, so the client never
   recomputes it.

   Kept deliberately parallel to the web module: same cuts, same tie-break,
   same floors and pity. The web copy carries the regression suite that pins
   the shared invariants (apps/web/src/lib/packs.test.ts). */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

export const RARITY_CUT: { rarity: Rarity; upTo: number }[] = [
  { rarity: "legendary", upTo: 0.03 },
  { rarity: "epic", upTo: 0.10 },
  { rarity: "rare", upTo: 0.50 },
  { rarity: "common", upTo: 1.00 },
];

export const PACK_SIZE = 16;
export const PITY_EPIC = 5;
export const PITY_LEGENDARY = 20;

export const PACK_FLOOR: Record<Rarity, { rarity: Rarity; count: number }> = {
  common: { rarity: "epic", count: 1 },
  rare: { rarity: "epic", count: 2 },
  epic: { rarity: "legendary", count: 1 },
  legendary: { rarity: "legendary", count: 3 },
};

export const DUPE_VALUE: Record<Rarity, number> = {
  common: 5, rare: 15, epic: 50, legendary: 200,
};

export const PACK_COST: Record<Rarity, number> = {
  common: 150, rare: 400, epic: 900, legendary: 2000,
};

/** Monthly pack grant by subscription tier. */
export const TIER_GRANT: Record<number, number> = { 1: 3, 2: 7, 3: 15 };

/** Points come only from proving cards. There is deliberately no "pack"
    event — opening one must pay nothing. */
export const POINTS = { review: 1, proof: 5, mastery: 25, streak: 20 } as const;

export const LEVEL_IDS = DEX_LEVELS.map(l => l.level);

/** The characters in each HSK level, for working out how full a band is. */
export const LEVEL_CHARS: Record<string, string[]> =
  Object.fromEntries(DEX_LEVELS.map(l => [l.level, [...l.chars]]));

export interface Rating {
  hanzi: string;
  tier: string;
  yield: number;
  rarity: Rarity;
}

let RATINGS: Map<string, Rating> | null = null;

/** Build the rating index from the HSK word list. Call once at startup with
    every `hsk_words.zh`; yields are how many words a character appears in. */
export function initRatings(words: string[]): void {
  const y = new Map<string, number>();
  for (const level of DEX_LEVELS) for (const c of level.chars) y.set(c, 0);
  for (const word of words) {
    // Once per word, not once per occurrence — 爸爸 must not score 爸 twice.
    for (const c of new Set([...word])) {
      const prev = y.get(c);
      if (prev !== undefined) y.set(c, prev + 1);
    }
  }

  const out = new Map<string, Rating>();
  for (const level of DEX_LEVELS) {
    const chars = [...level.chars];
    // Ties break on codepoint so the rating is stable across restarts.
    const ranked = [...chars].sort((a, b) => {
      const d = (y.get(b) ?? 0) - (y.get(a) ?? 0);
      return d !== 0 ? d : a.codePointAt(0)! - b.codePointAt(0)!;
    });
    const n = ranked.length;
    ranked.forEach((c, i) => {
      const cut = RARITY_CUT.find(k => i < Math.round(n * k.upTo)) ?? RARITY_CUT[RARITY_CUT.length - 1];
      out.set(c, { hanzi: c, tier: level.level, yield: y.get(c) ?? 0, rarity: cut.rarity });
    });
  }
  RATINGS = out;
}

export function ratingsReady(): boolean {
  return RATINGS !== null;
}

function index(): Map<string, Rating> {
  if (!RATINGS) throw new Error("ratings not initialised — call initRatings() at startup");
  return RATINGS;
}

export function ratingOf(hanzi: string): Rating | undefined {
  return index().get(hanzi);
}

export function rarityOf(hanzi: string): Rarity {
  return index().get(hanzi)?.rarity ?? "common";
}

export function poolFor(tier: string, rarity: Rarity): string[] {
  const out: string[] = [];
  for (const r of index().values()) if (r.tier === tier && r.rarity === rarity) out.push(r.hanzi);
  return out.sort();
}

function nextTier(tier: string): string {
  const i = LEVEL_IDS.indexOf(tier);
  return i >= 0 && i < LEVEL_IDS.length - 1 ? LEVEL_IDS[i + 1] : tier;
}

function rollRarity(rng: () => number): Rarity {
  const r = rng();
  for (const cut of RARITY_CUT) if (r < cut.upTo) return cut.rarity;
  return "common";
}

export interface RollOptions {
  grade: Rarity;
  tier: string;
  rng?: () => number;
  sinceEpic?: number;
  sinceLegendary?: number;
  /** Characters the learner already holds — excluded so a pack never deals a
      card they own. With 3,000 slots there is always something left. */
  owned?: Set<string>;
}

export interface RollResult {
  cards: Rating[];
  sinceEpic: number;
  sinceLegendary: number;
}

const BAND_NEXT_CHANCE = 0.2;

export function rollPack(opts: RollOptions): RollResult {
  const rng = opts.rng ?? Math.random;
  const sinceEpic = opts.sinceEpic ?? 0;
  const sinceLegendary = opts.sinceLegendary ?? 0;
  const owned = opts.owned ?? new Set<string>();

  const rarities: Rarity[] = [];
  for (let i = 0; i < PACK_SIZE; i++) rarities.push(rollRarity(rng));

  const floors = [PACK_FLOOR[opts.grade] ?? PACK_FLOOR.common];
  if (sinceEpic + 1 >= PITY_EPIC) floors.push({ rarity: "epic" as Rarity, count: 1 });
  if (sinceLegendary + 1 >= PITY_LEGENDARY) floors.push({ rarity: "legendary" as Rarity, count: 1 });

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
  const taken = new Set<string>(owned);
  for (const rarity of rarities) {
    const useNext = rng() < BAND_NEXT_CHANCE;
    const tiers = useNext ? [nextTier(opts.tier), opts.tier] : [opts.tier, nextTier(opts.tier)];
    let picked: Rating | undefined;
    for (const tier of tiers) {
      const pool = poolFor(tier, rarity).filter(h => !taken.has(h));
      if (pool.length) {
        picked = ratingOf(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]);
        break;
      }
    }
    // Every tier exhausted at this rarity — fall back down the grades rather
    // than deal a short pack.
    if (!picked) {
      for (let g = RARITY_ORDER.indexOf(rarity) - 1; g >= 0 && !picked; g--) {
        for (const tier of tiers) {
          const pool = poolFor(tier, RARITY_ORDER[g]).filter(h => !taken.has(h));
          if (pool.length) {
            picked = ratingOf(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]);
            break;
          }
        }
      }
    }
    if (picked) {
      taken.add(picked.hanzi);
      cards.push(picked);
    }
  }

  return {
    cards,
    sinceEpic: cards.some(c => RARITY_ORDER.indexOf(c.rarity) >= 2) ? 0 : sinceEpic + 1,
    sinceLegendary: cards.some(c => c.rarity === "legendary") ? 0 : sinceLegendary + 1,
  };
}
