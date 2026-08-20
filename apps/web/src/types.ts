export interface ExampleSentence {
  zh: string;
  py?: string;
  en?: string;
}

export interface Card {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  pos: string[];
  compound: boolean;
  radical?: string | null;
  strokes?: number | null;
  examples?: ExampleSentence[] | null;
  notes?: string | null;
  starred?: boolean;
  added: string;
  /** Cosmetic grade, stamped by the server when the card was granted. */
  rarity?: Rarity;
  /** "pack" | "grandfathered" — how the card entered the collection. */
  source?: string;
}

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** The pack economy. Points are earned only by proving cards. */
export interface Wallet {
  points: number;
  tier: number;
  packs: Record<string, number>;
  sinceEpic: number;
  sinceLegendary: number;
  tierBand: string;
  /** Packs this tier grants each month. */
  grant: number;
}

export interface SeenRecord {
  last: number;
  views: number;
  // SM-2-lite scheduling state, written by grading. Optional so a cached
  // pre-SRS snapshot from localStorage still deserializes.
  ease?: number;
  intervalDays?: number;
  due?: number | null; // epoch ms; null/absent = due now
  reps?: number;
  lapses?: number;
  /** The grade last pressed — what you rated it, as opposed to what the
   *  scheduler derived from it. Null until the card has been graded once. */
  lastGrade?: Grade | null;
  /** Recognised: picked the meaning correctly from the character (read mode). */
  readOk?: boolean;
  /** Produced: gave the character or its reading from the English (write mode). */
  writeOk?: boolean;
  /** Brushed: drew every stroke of the character by hand (brush mode). */
  brushOk?: boolean;
  /** 考 exam marks — clean strict passes banked in each direction, capped at
   *  MASTERY_MARKS. Full marks in all three is mastery (the shiny). Optional so
   *  a pre-mastery cached snapshot still deserializes. */
  readMarks?: number;
  writeMarks?: number;
  brushMarks?: number;
}

export type SeenMap = Record<string, SeenRecord>;

export type Grade = "again" | "hard" | "good" | "easy";

/**
 * Which direction a correct answer was produced in. Sent with a grade only
 * when the answer was right; one of each is what earns a character its dex
 * slot. "read" is recognition — the meaning picked from the character —
 * "write" is production, the character or its reading from the English, and
 * "brush" is writing it out by hand, stroke by stroke.
 */
export type Proof = "read" | "write" | "brush";

export type Theme = "light" | "dark";

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "failed";

/** How a preselected study session names itself on the study screen. */
export interface StudyOrigin {
  /** One hanzi standing for the source, matching the app's icon language. */
  zh: string;
  label: string;
  /** Plural noun for the pool, as in "drawn from 63 collected". */
  noun: string;
  emptyText: string;
}

/** "Study exactly these cards now" — see App's onStudyIds. */
export type StudyIds = (ids: string[], origin?: StudyOrigin) => void;
