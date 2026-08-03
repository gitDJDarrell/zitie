import { api, ApiError } from "../api/client";
import type { Card, Grade, SeenMap, SeenRecord, Theme, Proof } from "../types";
import { readCache, writeCache } from "./localCache";
import { enqueue, outboxDepth, readOutbox, writeOutbox, type NewOp, type PendingOp, type SettingsPatch } from "./outbox";
import type { PendingListener, StorageBackend, SyncListener } from "./types";

// Backend chain: API (source of truth) -> localStorage (offline cache, read on
// load failure / used to keep optimistic UI state warm across reloads) -> in-memory.
//
// Writes that fail on the network go to the outbox and are replayed on the
// next load and whenever the browser says it's back online, so a study session
// done offline reaches the server instead of being overwritten by it.
export class ApiStorage implements StorageBackend {
  private flushing = false;

  constructor(private notify: SyncListener, private onPending?: PendingListener) {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { void this.flush(); });
    }
    this.onPending?.(outboxDepth());
  }

  /** Parks a write for later and tells the UI how much is waiting. */
  private park(op: NewOp) {
    const depth = enqueue(op);
    this.notify("offline");
    this.onPending?.(depth);
  }

  /**
   * Replays parked writes oldest-first. Stops at the first network failure so
   * order is preserved; drops an op the server rejects outright (a card
   * deleted elsewhere, say) because retrying it forever would wedge the queue
   * behind it.
   */
  async flush(): Promise<number> {
    if (this.flushing) return outboxDepth();
    this.flushing = true;
    try {
      let queue = readOutbox();
      if (!queue.length) return 0;
      this.notify("syncing");

      while (queue.length) {
        const [op] = queue;
        try {
          await this.send(op);
        } catch (err) {
          if (!(err instanceof ApiError)) {
            // Still offline — leave this op and everything after it in place.
            this.notify("offline");
            this.onPending?.(queue.length);
            writeOutbox(queue);
            return queue.length;
          }
          if (err.status === 401) throw err; // session expired: let the auth gate deal with it
          // 4xx/5xx on this op specifically: it will never succeed, so drop it.
          console.warn(`[outbox] dropping ${op.kind} for ${"cardId" in op ? op.cardId : "settings"}: ${err.message}`);
        }
        queue = queue.slice(1);
        writeOutbox(queue);
        this.onPending?.(queue.length);
      }

      this.notify("synced");
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  private send(op: PendingOp): Promise<unknown> {
    switch (op.kind) {
      case "grade": return api.gradeCard(op.cardId, op.grade, op.proof, op.exam);
      case "seen": return api.markSeen(op.cardId);
      case "patch": return api.patchCard(op.cardId, op.patch);
      case "settings": return api.patchSettings(op.patch);
    }
  }

  async load() {
    this.notify("syncing");
    // Replay first: otherwise the fetch below would hand back server state
    // that doesn't know about the offline session and overwrite it.
    await this.flush().catch(() => {});
    try {
      const [{ cards, seen }, { theme, stack, difficulty }] = await Promise.all([api.getBank(), api.getSettings()]);
      const data = { bank: cards, srs: seen, theme, stack, difficulty };
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
      this.park({ kind: "patch", cardId: id, patch }); // optimistic state stands, replayed later
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
      this.park({ kind: "seen", cardId: id });
      return null;
    }
  }

  // Self-rating: drives the SRS scheduler. Returns the server's authoritative
  // post-grade state, or null when offline (optimistic local state stands).
  async gradeCard(id: string, grade: Grade, proof?: Proof, exam?: boolean): Promise<SeenRecord | null> {
    this.notify("syncing");
    try {
      const record = await api.gradeCard(id, grade, proof, exam);
      this.notify("synced");
      return record;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // The whole point of the outbox: a graded card on a train is a review
      // the scheduler must eventually see, not a keystroke into the void.
      this.park({ kind: "grade", cardId: id, grade, proof, exam });
      return null;
    }
  }

  async resetSeen(ids: string[] | null) {
    this.notify("syncing");
    await api.resetSeen(ids ?? undefined);
    this.notify("synced");
  }

  async setTheme(theme: Theme) {
    await this.settings({ theme });
  }

  async setStack(ids: string[]) {
    await this.settings({ stack: ids });
  }

  async setDifficulty(difficulty: number) {
    await this.settings({ difficulty });
  }

  /** Settings are last-write-wins, so a failed one just waits its turn. */
  private async settings(patch: SettingsPatch) {
    this.notify("syncing");
    try {
      await api.patchSettings(patch);
      this.notify("synced");
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.park({ kind: "settings", patch });
    }
  }

  cacheSnapshot(bank: Card[], srs: SeenMap, theme: Theme, stack: string[], difficulty?: number) {
    writeCache({ bank, srs, theme, stack, difficulty });
  }
}
