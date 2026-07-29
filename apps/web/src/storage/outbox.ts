// Durable queue of writes the server hasn't accepted yet.
//
// The bank and the app shell already survive offline; grading didn't. A grade
// pressed on a train posted to /seen, failed, and vanished — and the next
// successful load overwrote the optimistic local state with the server's,
// silently undoing the session. Now a failed write is parked here, in
// localStorage, and replayed in order when the network comes back.
//
// Deletes and imports deliberately stay out: they're explicit, destructive or
// expensive actions where failing loudly at the moment of the click is better
// than succeeding quietly an hour later.
import type { Card, Grade, Theme, Proof } from "../types";

export interface SettingsPatch {
  theme?: Theme;
  stack?: string[];
  autoSpeak?: boolean;
  difficulty?: number;
}

export type PendingOp =
  | { kind: "grade"; seq: number; at: number; cardId: string; grade: Grade; proof?: Proof }
  | { kind: "seen"; seq: number; at: number; cardId: string }
  | { kind: "patch"; seq: number; at: number; cardId: string; patch: Partial<Card> }
  | { kind: "settings"; seq: number; at: number; patch: SettingsPatch };

const KEY = "zitie-outbox";
// A long offline stretch shouldn't grow without bound. Well past a week of
// heavy study; beyond it the oldest writes are dropped rather than the newest,
// which are the ones the user still remembers making.
const MAX_OPS = 2000;

/**
 * Collapses redundant writes while preserving what the server needs to see.
 *
 * Every grade and every view is kept: each one is a distinct review event that
 * moves the scheduler, and replaying two grades is not the same as replaying
 * the last one. Card edits and settings are last-write-wins by nature, so
 * repeats of those fold into a single op at the position of the latest.
 */
export function collapse(ops: PendingOp[]): PendingOp[] {
  const patches = new Map<string, Partial<Card>>();
  const settings: SettingsPatch = {};
  let anySettings = false;

  for (const op of ops) {
    if (op.kind === "patch") patches.set(op.cardId, { ...patches.get(op.cardId), ...op.patch });
    else if (op.kind === "settings") { Object.assign(settings, op.patch); anySettings = true; }
  }

  const seenPatch = new Set<string>();
  let seenSettings = false;
  const out: PendingOp[] = [];

  // Walk backwards so a folded op lands at its latest position, then restore order.
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.kind === "patch") {
      if (seenPatch.has(op.cardId)) continue;
      seenPatch.add(op.cardId);
      out.push({ ...op, patch: patches.get(op.cardId) ?? op.patch });
    } else if (op.kind === "settings") {
      if (seenSettings) continue;
      seenSettings = true;
      out.push({ ...op, patch: anySettings ? settings : op.patch });
    } else {
      out.push(op);
    }
  }
  out.reverse();
  return out.length > MAX_OPS ? out.slice(out.length - MAX_OPS) : out;
}

export function readOutbox(): PendingOp[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingOp[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // unreadable or unavailable storage — nothing pending, not a crash
  }
}

export function writeOutbox(ops: PendingOp[]): void {
  try {
    if (ops.length) window.localStorage.setItem(KEY, JSON.stringify(ops));
    else window.localStorage.removeItem(KEY);
  } catch {
    // best-effort: a full or unavailable store loses the queue, not the session
  }
}

/** A write as the caller states it — the queue adds ordering and a timestamp. */
export type NewOp =
  | { kind: "grade"; cardId: string; grade: Grade; proof?: Proof }
  | { kind: "seen"; cardId: string }
  | { kind: "patch"; cardId: string; patch: Partial<Card> }
  | { kind: "settings"; patch: SettingsPatch };

let counter = 0;

/** Appends a write, collapsing anything it supersedes. Returns the new depth. */
export function enqueue(op: NewOp): number {
  const next = collapse([...readOutbox(), { ...op, seq: ++counter, at: Date.now() } as PendingOp]);
  writeOutbox(next);
  return next.length;
}

export function outboxDepth(): number {
  return readOutbox().length;
}

export function clearOutbox(): void {
  writeOutbox([]);
}
