import type { Card, SeenMap, SeenRecord, Theme } from "../types";

export interface StorageBackend {
  load(): Promise<{ bank: Card[]; srs: SeenMap; theme: Theme }>;
  importCards(items: unknown[]): Promise<{ cards: Card[]; added: number; updated: number }>;
  patchCard(id: string, patch: Partial<Card>): Promise<Card | null>;
  deleteCards(ids: string[]): Promise<void>;
  clearAll(): Promise<void>;
  markSeen(id: string): Promise<SeenRecord | null>;
  resetSeen(ids: string[] | null): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  cacheSnapshot(bank: Card[], srs: SeenMap, theme: Theme): void;
}

export type SyncState = "syncing" | "synced" | "offline";
export type SyncListener = (state: SyncState) => void;
