import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeCard, normalizeItem, type ExistingCard } from "./merge.js";

const base: ExistingCard = {
  pos: ["noun"],
  compound: false,
  radical: "水",
  strokes: 4,
  examples: [{ zh: "热水", py: "rè shuǐ", en: "hot water" }],
  notes: "Pictograph of a flowing stream.",
};

describe("normalizeItem", () => {
  it("requires hanzi, pinyin, and meaning", () => {
    assert.throws(() => normalizeItem({ hanzi: "水", pinyin: "shuǐ" }, 0), /Item 1 is missing/);
    assert.throws(() => normalizeItem(null, 4), /Item 5 is missing/);
  });

  it("coerces scalars to the right types", () => {
    const n = normalizeItem({ hanzi: "三", pinyin: "sān", meaning: "three", strokes: "3", compound: 0 }, 0);
    assert.equal(n.strokes, 3);
    assert.equal(n.compound, false);
  });

  it("omits fields that were not provided", () => {
    const n = normalizeItem({ hanzi: "水", pinyin: "shuǐ", meaning: "water" }, 0);
    assert.ok(!("pos" in n));
    assert.ok(!("compound" in n));
    assert.ok(!("examples" in n));
    assert.ok(!("notes" in n));
  });

  it("drops examples without zh", () => {
    const n = normalizeItem({
      hanzi: "水", pinyin: "shuǐ", meaning: "water",
      examples: [{ en: "no zh here" }, { zh: "冷水" }],
    }, 0);
    assert.deepEqual(n.examples, [{ zh: "冷水", py: "", en: "" }]);
  });
});

describe("mergeCard — the additive-expansion invariants", () => {
  it("updates scalars from the import", () => {
    const m = mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "shui3", meaning: "water; liquid" }, 0));
    assert.equal(m.pinyin, "shui3");
    assert.equal(m.meaning, "water; liquid");
  });

  it("preserves omitted fields exactly", () => {
    const m = mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "shuǐ", meaning: "water" }, 0));
    assert.deepEqual(m.pos, ["noun"]);
    assert.equal(m.compound, false);
    assert.equal(m.radical, "水");
    assert.equal(m.strokes, 4);
    assert.deepEqual(m.examples, base.examples);
    assert.equal(m.notes, base.notes);
  });

  it("unions pos without duplicates", () => {
    const m = mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "shuǐ", meaning: "water", pos: ["noun", "bound form"] }, 0));
    assert.deepEqual(m.pos, ["noun", "bound form"]);
  });

  it("unions examples keyed by zh, keeping existing entries first", () => {
    const m = mergeCard(base, normalizeItem({
      hanzi: "水", pinyin: "shuǐ", meaning: "water",
      examples: [{ zh: "热水", en: "duplicate — must not repeat" }, { zh: "冷水", en: "cold water" }],
    }, 0));
    assert.deepEqual(m.examples?.map((e) => e.zh), ["热水", "冷水"]);
    assert.equal(m.examples?.[0].en, "hot water");
  });

  it("appends new notes, skips notes already contained", () => {
    const appended = mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "shuǐ", meaning: "water", notes: "Appears as 氵." }, 0));
    assert.equal(appended.notes, "Pictograph of a flowing stream. Appears as 氵.");
    const skipped = mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "shuǐ", meaning: "water", notes: "flowing stream" }, 0));
    assert.equal(skipped.notes, base.notes);
  });

  it("fills fields that were previously empty", () => {
    const sparse: ExistingCard = { pos: [], compound: false, radical: null, strokes: null, examples: null, notes: null };
    const m = mergeCard(sparse, normalizeItem({
      hanzi: "吗", pinyin: "ma", meaning: "question particle",
      pos: ["particle"], radical: "口", strokes: 6, notes: "Neutral tone.",
    }, 0));
    assert.deepEqual(m.pos, ["particle"]);
    assert.equal(m.radical, "口");
    assert.equal(m.strokes, 6);
    assert.equal(m.notes, "Neutral tone.");
  });

  it("can flip compound in either direction when provided", () => {
    assert.equal(mergeCard(base, normalizeItem({ hanzi: "水", pinyin: "s", meaning: "w", compound: true }, 0)).compound, true);
    const compoundCard = { ...base, compound: true };
    assert.equal(mergeCard(compoundCard, normalizeItem({ hanzi: "水", pinyin: "s", meaning: "w", compound: false }, 0)).compound, false);
  });
});
