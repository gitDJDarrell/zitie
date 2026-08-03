import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextFor, EMBED_FROM_STRENGTH, wordsContaining } from "./context.js";
import type { SeenRecord } from "../types.js";

const DAY = 24 * 60 * 60 * 1000;

/** A record the scheduler would call weak — just met, one day out. */
const weak: SeenRecord = { last: 0, views: 1, ease: 2.5, intervalDays: 1, reps: 1, lapses: 0 };
/** A record the scheduler would call strong — held at a long interval. */
const strong: SeenRecord = { last: 0, views: 9, ease: 2.5, intervalDays: 40, reps: 6, lapses: 0 };

describe("wordsContaining", () => {
  it("finds real HSK words the character appears in", () => {
    const words = wordsContaining("咖");
    assert.ok(words.length > 0, "咖 should appear in at least one HSK word");
    assert.ok(words.every(w => w.includes("咖")), `every word must contain the character: ${words}`);
  });

  it("never offers a single character as context", () => {
    // Context means "seen past other characters" — a one-character result
    // would be the isolated prompt wearing a disguise.
    for (const ch of ["茶", "水", "人", "中"]) {
      assert.ok(wordsContaining(ch, 5).every(w => w.length >= 2), `${ch} got a single-char word`);
    }
  });

  it("prefers the shortest word — the smallest honest unit", () => {
    const words = wordsContaining("学", 5);
    for (let i = 1; i < words.length; i++) {
      assert.ok(words[i].length >= words[i - 1].length, `not shortest-first: ${words}`);
    }
  });

  it("respects the limit and dedupes", () => {
    const words = wordsContaining("人", 3);
    assert.ok(words.length <= 3);
    assert.equal(new Set(words).size, words.length);
  });

  it("returns nothing for input that isn't a single character", () => {
    assert.deepEqual(wordsContaining("咖啡"), []);
    assert.deepEqual(wordsContaining(""), []);
  });
});

describe("contextFor", () => {
  it("shows a freshly met character on its own", () => {
    const ctx = contextFor("茶", weak);
    assert.equal(ctx.display, "茶");
    assert.equal(ctx.embedded, false);
  });

  it("embeds a character once the memory is strong", () => {
    const ctx = contextFor("茶", strong);
    assert.equal(ctx.embedded, true, "a well-known character should be met in a word");
    assert.ok(ctx.display.length >= 2);
    assert.ok(ctx.display.includes("茶"));
  });

  it("points at where the character actually sits in the word", () => {
    const ctx = contextFor("啡", strong);
    if (!ctx.embedded) return;              // no HSK word for it — nothing to check
    assert.equal(ctx.display[ctx.at], "啡",
      `at=${ctx.at} should index the target inside ${ctx.display}`);
  });

  it("leaves a multi-character card alone — a word is already its own context", () => {
    const ctx = contextFor("咖啡", strong);
    assert.equal(ctx.display, "咖啡");
    assert.equal(ctx.embedded, false);
  });

  it("falls back to the bare character when no HSK word contains it", () => {
    // A character outside the word list has nowhere honest to hide. It must
    // never be dressed up in an invented word.
    const ctx = contextFor("鑫", strong);
    assert.equal(ctx.display, "鑫");
    assert.equal(ctx.embedded, false);
  });

  it("treats a never-graded card as weak", () => {
    assert.equal(contextFor("茶", undefined).embedded, false);
  });

  it("honours an explicit override in both directions", () => {
    assert.equal(contextFor("茶", strong, { force: "isolated" }).embedded, false);
    assert.equal(contextFor("茶", weak, { force: "embedded" }).embedded, true);
  });

  it("switches over exactly at the documented strength", () => {
    // Interval is what strengthOf reads; walk it across the threshold.
    const at = (intervalDays: number): SeenRecord =>
      ({ last: 0, views: 5, ease: 2.5, intervalDays, reps: 4, lapses: 0 });
    assert.equal(contextFor("茶", at(1)).embedded, false, "strength 1 stays isolated");
    assert.equal(contextFor("茶", at(7)).embedded, true, `strength ${EMBED_FROM_STRENGTH} embeds`);
  });
});
