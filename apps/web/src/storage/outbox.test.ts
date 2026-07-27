import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapse, type PendingOp } from "./outbox";

let seq = 0;
const grade = (cardId: string, g: "again" | "hard" | "good" | "easy"): PendingOp =>
  ({ kind: "grade", seq: ++seq, at: seq, cardId, grade: g });
const seen = (cardId: string): PendingOp => ({ kind: "seen", seq: ++seq, at: seq, cardId });
const patch = (cardId: string, p: Record<string, unknown>): PendingOp =>
  ({ kind: "patch", seq: ++seq, at: seq, cardId, patch: p });
const settings = (p: Record<string, unknown>): PendingOp =>
  ({ kind: "settings", seq: ++seq, at: seq, patch: p });

describe("collapse", () => {
  it("keeps every grade — each one moves the scheduler", () => {
    const ops = [grade("a", "again"), grade("a", "hard"), grade("a", "good")];
    assert.deepEqual(collapse(ops).map(o => (o as { grade: string }).grade), ["again", "hard", "good"]);
  });

  it("keeps every view for the same reason", () => {
    assert.equal(collapse([seen("a"), seen("a"), seen("a")]).length, 3);
  });

  it("folds repeated edits of one card into the latest state", () => {
    const out = collapse([patch("a", { starred: true }), patch("a", { starred: false })]);
    assert.equal(out.length, 1);
    assert.deepEqual((out[0] as { patch: unknown }).patch, { starred: false });
  });

  it("merges different fields of the same card rather than losing one", () => {
    const out = collapse([patch("a", { starred: true }), patch("a", { notes: "hi" })]);
    assert.deepEqual((out[0] as { patch: unknown }).patch, { starred: true, notes: "hi" });
  });

  it("keeps edits to different cards apart", () => {
    const out = collapse([patch("a", { starred: true }), patch("b", { starred: true })]);
    assert.deepEqual(out.map(o => (o as { cardId: string }).cardId), ["a", "b"]);
  });

  it("folds settings into one op with the last value per field", () => {
    const out = collapse([
      settings({ theme: "dark" }),
      settings({ difficulty: 3 }),
      settings({ theme: "light" }),
    ]);
    assert.equal(out.length, 1);
    assert.deepEqual((out[0] as { patch: unknown }).patch, { theme: "light", difficulty: 3 });
  });

  it("preserves the order grades and edits happened in", () => {
    const out = collapse([grade("a", "good"), patch("b", { starred: true }), grade("c", "easy")]);
    assert.deepEqual(out.map(o => o.kind), ["grade", "patch", "grade"]);
  });

  it("places a folded op at its latest position", () => {
    const out = collapse([patch("a", { starred: true }), grade("b", "good"), patch("a", { notes: "x" })]);
    assert.deepEqual(out.map(o => o.kind), ["grade", "patch"]);
  });

  it("drops the oldest writes past the cap, keeping the newest", () => {
    const many = Array.from({ length: 2100 }, (_, i) => grade(`card-${i}`, "good"));
    const out = collapse(many);
    assert.equal(out.length, 2000);
    assert.equal((out.at(-1) as { cardId: string }).cardId, "card-2099");
  });

  it("returns an empty queue untouched", () => {
    assert.deepEqual(collapse([]), []);
  });
});
