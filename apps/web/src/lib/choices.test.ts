import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meaningChoices, CHOICE_COUNT } from "./choices.js";
import type { Card } from "../types.js";

const card = (id: string, hanzi: string, meaning: string, pos: string[] = ["noun"]): Card => ({
  id, hanzi, pinyin: "x", meaning, pos, compound: false, added: "2026-01-01",
});

const target = card("t", "水", "water", ["noun"]);
const bank = [
  target,
  card("a", "火", "fire", ["noun"]),
  card("b", "山", "mountain", ["noun"]),
  card("c", "木", "tree, wood", ["noun"]),
  card("d", "吃", "to eat", ["verb"]),
  card("e", "跑", "to run", ["verb"]),
];

// Deterministic "random" so the shuffle is checkable.
const fixed = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("meaningChoices", () => {
  it("always includes the card's own meaning", () => {
    const options = meaningChoices(target, bank, CHOICE_COUNT, fixed([0]));
    assert.ok(options.includes("water"), options.join(" | "));
  });

  it("offers the requested number of distinct options", () => {
    const options = meaningChoices(target, bank, CHOICE_COUNT, fixed([0.1, 0.5, 0.9]));
    assert.equal(options.length, CHOICE_COUNT);
    assert.equal(new Set(options).size, CHOICE_COUNT);
  });

  it("never offers the card itself as a distractor", () => {
    const options = meaningChoices(target, bank, CHOICE_COUNT, fixed([0.3]));
    assert.equal(options.filter(o => o === "water").length, 1);
  });

  it("prefers distractors sharing a part of speech", () => {
    // Three nouns are available, so a verb should never need to be used.
    const options = meaningChoices(target, bank, CHOICE_COUNT, fixed([0, 0, 0]));
    assert.ok(!options.includes("to eat"), options.join(" | "));
    assert.ok(!options.includes("to run"), options.join(" | "));
  });

  it("refuses rather than offering a two-way guess", () => {
    // One other card can't field three wrong answers; the caller falls back
    // to the classic flip instead of showing a coin toss.
    assert.deepEqual(meaningChoices(target, [target, bank[1]], CHOICE_COUNT, fixed([0])), []);
  });

  it("leaves out a card whose meaning restates the answer", () => {
    const near = [
      target,
      card("x", "冰", "water (frozen)"),
      card("y", "火", "fire"),
      card("z", "山", "mountain"),
      card("w", "木", "tree"),
    ];
    const options = meaningChoices(target, near, CHOICE_COUNT, fixed([0]));
    assert.ok(!options.includes("water (frozen)"), options.join(" | "));
  });

  it("does not put the answer in the same slot every time", () => {
    const first = meaningChoices(target, bank, CHOICE_COUNT, fixed([0.99, 0.99, 0.99]));
    const second = meaningChoices(target, bank, CHOICE_COUNT, fixed([0, 0, 0]));
    assert.notEqual(first.indexOf("water"), second.indexOf("water"));
  });
});
