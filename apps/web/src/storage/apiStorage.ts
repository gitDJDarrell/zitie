import { api, ApiError } from "../api/client";
import type { Card, Grade, SeenMap, SeenRecord, Theme } from "../types";
import { readCache, writeCache } from "./localCache";
import type { StorageBackend, SyncListener } from "./types";

// Backend chain: API (source of truth) -> localStorage (offline cache, read on
// load failure / used to keep optimistic UI state warm across reloads) -> in-memory.
export class ApiStorage implements StorageBackend {
  constructor(private notify: SyncListener) {}

  async load() {
    this.notify("syncing");
    try {
      const [{ cards, seen }, { theme, stack, autoSpeak, difficulty }] = await Promise.all([api.getBank(), api.getSettings()]);
      const data = { bank: cards, srs: seen, theme, stack, autoSpeak, difficulty };
      writeCache(data);
      this.notify("synced");
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err; // 401 etc — let the auth gate handle it
      this.notify("offline");
      const cached = readCache();
      return {
        bank: cached?.bank ?? [],
        srs: cached?.srs ?? ({} as SeenMap),
        theme: cached?.theme ?? ("light" as Theme),
        stack: cached?.stack ?? [],
        autoSpeak: cached?.autoSpeak ?? true,
        difficulty: cached?.difficulty ?? 2,
      };
    }
  }

  async importCards(items: unknown[]) {
    this.notify("syncing");
    const result = await api.importCards(items); // network/validation errors surface to the caller
    this.notify("synced");
    return result;
  }

  async patchCard(id: string, patch: Partial<Card>): Promise<Card | null> {
    this.notify("syncing");
    try {
      const card = await api.patchCard(id, patch);
      this.notify("synced");
      return card;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.notify("offline"); // optimistic local state stands; will need a manual retry
      return null;
    }
  }

  async deleteCards(ids: string[]) {
    this.notify("syncing");
    await api.deleteCards(ids);
    this.notify("synced");
  }

  async clearAll() {
    this.notify("syncing");
    await api.clearAll();
    this.notify("synced");
  }

  async markSeen(id: string): Promise<SeenRecord | null> {
    this.notify("syncing");
    try {
      const record = await api.markSeen(id);
      this.notify("synced");
      return record;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.notify("offline");
      return null;
    }
  }

  // Self-rating: drives the SRS scheduler. Returns the server's authoritative
  // post-grade state, or null when offline (optimistic local state stands).
  async gradeCard(id: string, grade: Grade): Promise<SeenRecord | null> {
    this.notify("syncing");
    try {
      const record = await api.gradeCard(id, grade);
      this.notify("synced");
      return record;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.notify("offline");
      return null;
    }
  }

  async resetSeen(ids: string[] | null) {
    this.notify("syncing");
    await api.resetSeen(ids ?? undefined);
    this.notify("synced");
  }

  async setTheme(theme: Theme) {
    this.notify("syncing");
    await api.patchSettings({ theme });
    this.notify("synced");
  }

  async setStack(ids: string[]) {
    this.notify("syncing");
    await api.patchSettings({ stack: ids });
    this.notify("synced");
  }

  async setAutoSpeak(autoSpeak: boolean) {
    this.notify("syncing");
    await api.patchSettings({ autoSpeak });
    this.notify("synced");
  }

  async setDifficulty(difficulty: number) {
    this.notify("syncing");
    await api.patchSettings({ difficulty });
    this.notify("synced");
  }

  cacheSnapshot(bank: Card[], srs: SeenMap, theme: Theme, stack: string[], autoSpeak?: boolean, difficulty?: number) {
    writeCache({ bank, srs, theme, stack, autoSpeak, difficulty });
  }
}
