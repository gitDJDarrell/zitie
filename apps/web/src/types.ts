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
}

export type SeenMap = Record<string, SeenRecord>;

export type Grade = "again" | "hard" | "good" | "easy";

export type Theme = "light" | "dark";

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "failed";
