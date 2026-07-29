import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTableColumns } from "drizzle-orm";
import { seenState } from "../db/schema.js";
import { serializeSeen } from "./seenWire.js";

const NOW = new Date("2026-07-29T12:00:00Z");

const row: typeof seenState.$inferSelect = {
  cardId: "abc", userId: "u1",
  last: NOW, views: 3,
  ease: 2.35, intervalDays: 4.5, due: new Date(NOW.getTime() + 86_400_000),
  reps: 2, lapses: 1, lastGrade: "hard",
  readOk: true, writeOk: false, brushOk: false,
};

describe("serializeSeen", () => {
  it("flattens timestamps to epoch millis", () => {
    const w = serializeSeen(row);
    assert.equal(w.last, NOW.getTime());
    assert.equal(w.due, NOW.getTime() + 86_400_000);
  });

  it("passes a null due date through as null, not 0", () => {
    assert.equal(serializeSeen({ ...row, due: null }).due, null);
  });

  it("carries the dex proofs — losing these silently empties the dex on reload", () => {
    const w = serializeSeen(row);
    assert.equal(w.readOk, true);
    assert.equal(w.writeOk, false);
    assert.equal(w.brushOk, false);
  });

  it("carries the last grade pressed", () => {
    assert.equal(serializeSeen(row).lastGrade, "hard");
  });

  /**
   * The guard that matters. GET /cards and POST /seen/grade both hand seen
   * records to the client; when they each wrote the shape out longhand they
   * drifted, readOk/writeOk reached only one of them, and every earned dex
   * proof disappeared on the next page load. Any column added to seen_state
   * must be answered for here — either exposed, or named as deliberately
   * withheld — so the omission is a failing test rather than a silent hole.
   */
  it("accounts for every column in seen_state", () => {
    // Server-side bookkeeping the client has no use for.
    const withheld = new Set(["cardId", "userId"]);
    // getTableColumns, not Object.keys — the table object also carries drizzle
    // internals (enableRLS and friends) that are not columns at all.
    const columns = Object.keys(getTableColumns(seenState));
    const exposed = new Set(Object.keys(serializeSeen(row)));

    const unaccounted = columns.filter(c => !exposed.has(c) && !withheld.has(c));
    assert.deepEqual(unaccounted, [],
      `seen_state columns reach no client: ${unaccounted.join(", ")}. ` +
      "Add them to serializeSeen, or to `withheld` above if that is deliberate.");
  });
});
