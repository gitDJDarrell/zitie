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

/**
 * The omission this was changed to fix. Reading in the wild fails on
 * look-alikes, but the distractor ranking only knew about part of speech and
 * gloss length — so shown 木 among fire, mountain and to run, a learner who
 * cannot tell it from 本 still answered correctly and the test found nothing
 * out. One slot is now reserved for a character that resembles the one under
 * test, so the question probes the failure that actually costs you a sign.
 */
describe("look-alike distractors", () => {
  const wood = card("m", "木", "tree, wood", ["noun"]);
  // 火 山 吃 跑 are none of them confusable with 木; 本 is.
  const root = card("n", "本", "root; origin", ["noun"]);
  const withRoot = [wood, root, card("a", "火", "fire"), card("b", "山", "mountain"),
    card("d", "吃", "to eat", ["verb"]), card("e", "跑", "to run", ["verb"])];

  it("offers the meaning of a character that looks like the answer", () => {
    // Whatever the draw, 本 is there: a learner who reads 木 as 本 now has
    // somewhere wrong to go, which is the whole point of the change.
    for (const r of [fixed([0]), fixed([0.5]), fixed([0.99]), fixed([0.2, 0.7, 0.4])]) {
      const options = meaningChoices(wood, withRoot, CHOICE_COUNT, r);
      assert.ok(options.includes("root; origin"), options.join(" | "));
    }
  });

  it("reserves the slot rather than just ranking it higher", () => {
    // 找 is a verb where 我 is a pronoun, so distance() sorts it last of all —
    // if the look-alike were only another term in that ranking it would lose to
    // three tidy pronouns every time. It is the pair a reader actually confuses.
    const me = card("me", "我", "I; me", ["pronoun"]);
    const bankOf = [me,
      card("s", "找", "to look for", ["verb"]),
      card("p", "你", "you", ["pronoun"]),
      card("q", "他", "he; him", ["pronoun"]),
      card("r", "她", "she; her", ["pronoun"])];
    const options = meaningChoices(me, bankOf, CHOICE_COUNT, fixed([0]));
    assert.ok(options.includes("to look for"), options.join(" | "));
  });

  it("still fields a full question when nothing in the bank looks alike", () => {
    // 火's look-alikes are 犬太大灭欠夫久, none of which are here. The reserved
    // slot goes unfilled and every distractor is ranked on meaning as before —
    // not a refusal, and not a short list.
    const fire = card("a", "火", "fire", ["noun"]);
    const noTwin = [fire, wood, card("b", "山", "mountain"),
      card("d", "吃", "to eat", ["verb"]), card("e", "跑", "to run", ["verb"])];
    const options = meaningChoices(fire, noTwin, CHOICE_COUNT, fixed([0.3, 0.6]));
    assert.equal(options.length, CHOICE_COUNT);
    assert.ok(options.includes("fire"));
  });

  it("keeps refusing rather than offering a two-way guess", () => {
    // The escape hatch survives the reserved slot: a bank holding only the
    // card and its look-alike still can't field three wrong answers.
    assert.deepEqual(meaningChoices(wood, [wood, root], CHOICE_COUNT, fixed([0])), []);
  });

  it("leaves a meaning-ranked distractor even at two options", () => {
    // Exam mode sizes its options off the bank, so `count` can fall to two.
    // The reserved slot must not eat the only distractor there is.
    const options = meaningChoices(wood, withRoot, 2, fixed([0]));
    assert.equal(options.length, 2);
    assert.equal(options.filter(o => isAnswer(o, wood)).length, 1);
  });

  it("sanitises a look-alike's gloss like any other option", () => {
    // The hard rule, through the new path: 本 is reserved on sight of the
    // glyph, so if its gloss were a bound form it would carry hanzi into the
    // options — and a hanzi anywhere in the set is a glyph-matching tell.
    const bound = card("n", "本", "used in 本子 (notebook)", ["noun"]);
    const options = meaningChoices(wood, [wood, bound, ...withRoot.slice(2)], CHOICE_COUNT, fixed([0]));
    assert.ok(options.includes("notebook"), options.join(" | "));
    for (const o of options) assert.ok(!/[一-鿿]/.test(o), `option "${o}" carries hanzi`);
  });

  it("still marks exactly one option correct", () => {
    // isAnswer has to agree with what was rendered, reserved slot or not.
    const options = meaningChoices(wood, withRoot, CHOICE_COUNT, fixed([0.4, 0.8]));
    assert.equal(options.filter(o => isAnswer(o, wood)).length, 1);
  });

  it("never offers a look-alike whose meaning restates the answer", () => {
    // 未 and 末 look alike and their glosses can read the same way. Two right
    // answers is worse than a weak distractor, so the pool's existing overlap
    // rule has to win over the reservation.
    const notYet = card("u", "未", "not yet", ["adverb"]);
    const bankOf = [notYet, card("v", "末", "not yet (literary)", ["adverb"]),
      card("w", "很", "very", ["adverb"]), card("x", "都", "all", ["adverb"]),
      card("y", "也", "also", ["adverb"])];
    const options = meaningChoices(notYet, bankOf, CHOICE_COUNT, fixed([0]));
    assert.ok(!options.includes("not yet (literary)"), options.join(" | "));
    assert.equal(options.filter(o => isAnswer(o, notYet)).length, 1);
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
