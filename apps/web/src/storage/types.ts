import type { Card, Grade, SeenMap, SeenRecord, Theme } from "../types";

export interface LoadedState {
  bank: Card[];
  srs: SeenMap;
  theme: Theme;
  stack: string[];
  autoSpeak: boolean;
  difficulty: number;
}

export interface StorageBackend {
  load(): Promise<LoadedState>;
  importCards(items: unknown[]): Promise<{ cards: Card[]; added: number; updated: number }>;
  patchCard(id: string, patch: Partial<Card>): Promise<Card | null>;
  deleteCards(ids: string[]): Promise<void>;
  clearAll(): Promise<void>;
  markSeen(id: string): Promise<SeenRecord | null>;
  gradeCard(id: string, grade: Grade): Promise<SeenRecord | null>;
  resetSeen(ids: string[] | null): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  setStack(ids: string[]): Promise<void>;
  setAutoSpeak(autoSpeak: boolean): Promise<void>;
  setDifficulty(difficulty: number): Promise<void>;
  cacheSnapshot(bank: Card[], srs: SeenMap, theme: Theme, stack: string[], autoSpeak?: boolean, difficulty?: number): void;
}

export type SyncState = "syncing" | "synced" | "offline";
export type SyncListener = (state: SyncState) => void;
/** How many writes are parked in the outbox, waiting for the network. */
export type PendingListener = (depth: number) => void;
