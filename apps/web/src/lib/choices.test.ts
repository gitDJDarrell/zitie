import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAnswer, meaningChoices, optionGloss, CHOICE_COUNT } from "./choices.js";
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

describe("optionGloss", () => {
  /**
   * The spoiler. A bound form is glossed by the word it lives in, so 啡's
   * meaning is "used in 咖啡 (coffee)" — and offered verbatim it printed the
   * character under test inside its own correct answer. You could pick the
   * right option by matching glyphs, having read nothing. Showing the
   * character in context made it exact: the prompt 咖啡 and the answer text
   * became the same string.
   */
  it("unwraps a bound form to the English it was carrying", () => {
    assert.equal(optionGloss("used in 咖啡 (coffee)"), "coffee");
  });

  it("keeps a real meaning and drops only the usage note", () => {
    assert.equal(optionGloss("rotten; fermented — used in 豆腐 (tofu)"), "rotten; fermented");
  });

  it("leaves an ordinary gloss untouched", () => {
    assert.equal(optionGloss("net; the internet"), "net; the internet");
    assert.equal(optionGloss("Korea (bound); the surname Han"), "Korea (bound); the surname Han");
  });

  it("never returns a hanzi, whatever the gloss looked like", () => {
    for (const m of [
      "used in 咖啡 (coffee)",
      "rotten; fermented — used in 豆腐 (tofu)",
      "a stray 字 in the middle",
      "used in 豆腐",
    ]) {
      assert.ok(!/[一-鿿]/.test(optionGloss(m)), `${m} → ${optionGloss(m)} still carries hanzi`);
    }
  });

  it("never returns nothing", () => {
    // Better a raw gloss than a blank option the learner cannot choose.
    assert.ok(optionGloss("字").length > 0);
  });
});

describe("options never spoil the prompt", () => {
  const bound = card("f", "啡", "used in 咖啡 (coffee)", ["noun"]);
  const withBound = [bound, ...bank];

  it("does not print the character under test inside its own answer", () => {
    const options = meaningChoices(bound, withBound, CHOICE_COUNT, fixed([0.1, 0.4, 0.7]));
    assert.ok(options.length > 0, "should still be able to field a question");
    for (const o of options) {
      assert.ok(!o.includes("啡"), `option "${o}" hands over the answer`);
      assert.ok(!/[一-鿿]/.test(o), `option "${o}" carries hanzi`);
    }
  });

  it("still recognises the sanitised answer as correct", () => {
    // The rule that broke five call sites: options are sanitised on the way
    // out, so comparing a tap against the raw meaning marks every bound form
    // wrong. isAnswer has to agree with what was actually rendered.
    const options = meaningChoices(bound, withBound, CHOICE_COUNT, fixed([0.1, 0.4, 0.7]));
    const correct = options.filter(o => isAnswer(o, bound));
    assert.equal(correct.length, 1, `exactly one option must be the answer, got ${correct.length}`);
    assert.equal(correct[0], "coffee");
  });
});
