import { DEX_INDEX, DEX_LEVELS } from "../data/dex";
import type { Card, SeenMap } from "../types";
import { bySrsPriority, isDue } from "./srs";

// Session shape is set by two independent controls, because they answer
// different questions:
//
//   difficulty (slider) — "how hard should this session work me?"  Scales the
//     session length and how aggressively it front-loads cards you're shaky
//     on versus ones you already know.
//   levels (dropdown)   — "which material?"  An explicit HSK selection.
//
// Bundling both into one slider (the first cut of this) meant you couldn't ask
// for "a short session on HSK 4" — reaching HSK 4 forced a 40-card session.

export interface DifficultyStep {
  id: number;
  label: string;
  zh: string;
  cards: number;
  /**
   * Share of the session reserved for cards needing work — overdue reviews and
   * never-studied characters. The remainder is padded with well-known cards,
   * so an easy session feels like revision and a hard one like a drill.
   */
  challengeShare: number;
}

export const DIFFICULTY_STEPS: DifficultyStep[] = [
  { id: 0, label: "gentle",     zh: "缓", cards: 10, challengeShare: 0.3 },
  { id: 1, label: "easy",       zh: "易", cards: 15, challengeShare: 0.5 },
  { id: 2, label: "steady",     zh: "稳", cards: 25, challengeShare: 0.7 },
  { id: 3, label: "hard",       zh: "难", cards: 40, challengeShare: 0.9 },
  { id: 4, label: "relentless", zh: "狠", cards: 60, challengeShare: 1.0 },
];

export function stepFor(difficulty: number): DifficultyStep {
  return DIFFICULTY_STEPS[Math.min(DIFFICULTY_STEPS.length - 1, Math.max(0, difficulty))];
}

/** Dex level id for a card, or null when it sits outside the HSK dex. */
export function levelIdOf(card: Card): string | null {
  return DEX_INDEX.get(card.hanzi)?.levelId ?? null;
}

/** The level ids present in a bank, in dex order, plus "beyond" when relevant. */
export function availableLevels(bank: Card[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  let beyond = 0;
  for (const c of bank) {
    const id = levelIdOf(c);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    else beyond++;
  }
  const out = DEX_LEVELS
    .filter(l => counts.has(l.id))
    .map(l => ({ id: l.id, label: l.label, count: counts.get(l.id)! }));
  if (beyond) out.push({ id: BEYOND_ID, label: "Beyond the dex", count: beyond });
  return out;
}

/** Pseudo-level for compounds and characters outside the HSK dex. */
export const BEYOND_ID = "beyond";

/** Keep only cards in the selected levels. An empty selection means "all". */
export function filterByLevels(pool: Card[], levels: string[]): Card[] {
  if (!levels.length) return pool;
  const want = new Set(levels);
  return pool.filter(c => want.has(levelIdOf(c) ?? BEYOND_ID));
}

/**
 * Narrow a level-filtered pool down to one session.
 *
 * Cards are split into "needs work" (due for review or never studied) and
 * "known" (scheduled comfortably into the future). The difficulty step decides
 * the mix: gentle sessions are mostly revision of things you know, relentless
 * ones are all cards you're about to forget. Within each group, the most
 * overdue leads.
 */
export function buildSession(pool: Card[], srs: SeenMap, difficulty: number, now = Date.now()): Card[] {
  const step = stepFor(difficulty);
  const ordered = [...pool].sort(bySrsPriority(srs, now));
  const needsWork = ordered.filter(c => isDue(srs[c.id], now));
  const known = ordered.filter(c => !isDue(srs[c.id], now));

  const target = Math.min(step.cards, pool.length);
  const wantChallenge = Math.min(needsWork.length, Math.round(target * step.challengeShare));

  const picked = [
    ...needsWork.slice(0, wantChallenge),
    ...known.slice(0, target - wantChallenge),
  ];
  // Backfill if one side ran dry — the session should still reach `target`.
  if (picked.length < target) {
    const taken = new Set(picked.map(c => c.id));
    for (const c of ordered) {
      if (picked.length >= target) break;
      if (!taken.has(c.id)) picked.push(c);
    }
  }
  return picked;
}

/** How many cards this difficulty would actually serve from the pool. */
export function sessionSize(pool: Card[], difficulty: number): number {
  return Math.min(stepFor(difficulty).cards, pool.length);
}
