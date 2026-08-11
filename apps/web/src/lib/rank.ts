// The 科举 rank ladder — the visible title on top of the exam's Elo rating.
//
// The server owns the number (apps/api/src/lib/rating.ts): every 考 exam trial
// nudges a hidden Elo up on a clean pass, down on a miss. This maps that number
// onto the imperial-examination ranks a scholar climbed — from 童生, a bare
// candidate, to 状元, the empire's single top laureate. The rank is what you
// show off; the rating is the ladder underneath it, and the progress bar is how
// far up the current rung you are.
//
// Bands are deliberately wide and the climb deliberately long: the rating
// converges on your true strict-recall strength, so the top ranks are years of
// patient mastery, not an afternoon's grinding. Mirrors RATING_BASE on the
// server — a fresh account starts here, as 童生.

export const RATING_BASE = 1000;

export interface Rank {
  /** Lowest rating that earns this rank. */
  min: number;
  zh: string;
  py: string;
  en: string;
}

// Ascending by `min`. The first band is the floor (everyone lands here at
// least); the last is open-ended at the top.
export const RANKS: Rank[] = [
  { min: 0,    zh: "童生", py: "tóngshēng", en: "candidate" },
  { min: 1080, zh: "秀才", py: "xiùcai",    en: "licentiate" },
  { min: 1160, zh: "举人", py: "jǔrén",     en: "provincial graduate" },
  { min: 1240, zh: "贡士", py: "gòngshì",   en: "tribute scholar" },
  { min: 1320, zh: "进士", py: "jìnshì",    en: "metropolitan graduate" },
  { min: 1400, zh: "探花", py: "tànhuā",    en: "third laureate" },
  { min: 1480, zh: "榜眼", py: "bǎngyǎn",   en: "second laureate" },
  { min: 1560, zh: "状元", py: "zhuàngyuán", en: "top laureate" },
];

export interface RankStanding {
  rank: Rank;
  /** The next rank up, or null when already at 状元. */
  next: Rank | null;
  /** 0–1 through the current band toward the next rank (1 at the very top). */
  progress: number;
  /** Rating points still needed for the next rank, or 0 at the top. */
  toNext: number;
  rating: number;
}

/** Where a rating stands on the ladder — current rank, next, and progress. */
export function rankFor(rating: number): RankStanding {
  const r = Math.round(rating);
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (r >= RANKS[k].min) i = k;
  const rank = RANKS[i];
  const next = i < RANKS.length - 1 ? RANKS[i + 1] : null;
  if (!next) return { rank, next: null, progress: 1, toNext: 0, rating: r };
  const span = next.min - rank.min;
  const progress = Math.min(1, Math.max(0, (r - rank.min) / span));
  return { rank, next, progress, toNext: Math.max(0, next.min - r), rating: r };
}
