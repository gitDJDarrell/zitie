import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { componentEntries, pickCompounds, storyFor, structureFor, structureLabel } from "./breakdown.js";
import { lookupHanzi } from "./hanzi.js";

describe("structureLabel", () => {
  it("puts the description operator into words", () => {
    assert.equal(structureLabel("⿰口乞"), "⿰ left–right");
    assert.equal(structureLabel("⿱⿱爫冖友"), "⿱ stacked");
  });

  it("calls a character with no decomposition indivisible", () => {
    assert.equal(structureLabel(undefined), "simple / indivisible");
  });

  it("labels a pictograph as such rather than by its stroke split", () => {
    const water = lookupHanzi("水");
    assert.ok(water);
    assert.equal(structureFor(water), "pictograph");
  });
});

describe("componentEntries", () => {
  it("splits a pictophonetic character into its sense and sound halves", () => {
    const facts = lookupHanzi("妈");
    assert.ok(facts);
    const parts = componentEntries(facts, lookupHanzi);
    assert.deepEqual(parts.map((p) => [p.char, p.role]), [["女", "semantic"], ["马", "phonetic"]]);
  });

  it("leaves the sound half's meaning off — 妈 has nothing to do with horses", () => {
    const facts = lookupHanzi("妈");
    assert.ok(facts);
    const phonetic = componentEntries(facts, lookupHanzi).find((p) => p.char === "马");
    assert.equal(phonetic?.gloss, undefined);
    assert.equal(phonetic?.reading, "mǎ");
  });

  it("notes which part is the radical", () => {
    const facts = lookupHanzi("吃");
    assert.ok(facts);
    const radical = componentEntries(facts, lookupHanzi).find((p) => p.char === "口");
    assert.match(radical?.note ?? "", /radical/i);
  });

  it("gives a pictograph no components — its parts are strokes", () => {
    const facts = lookupHanzi("水");
    assert.ok(facts);
    assert.deepEqual(componentEntries(facts, lookupHanzi), []);
  });

  it("calls parts 'form' when no etymology is recorded, rather than claiming meaning", () => {
    const facts = lookupHanzi("的");
    assert.ok(facts);
    assert.ok(componentEntries(facts, lookupHanzi).every((p) => p.role === "form"));
  });

  it("calls parts 'meaning' when the etymology says they combine by sense", () => {
    const facts = lookupHanzi("好");
    assert.ok(facts);
    assert.ok(componentEntries(facts, lookupHanzi).some((p) => p.role === "meaning"));
  });
});

describe("storyFor", () => {
  it("names both halves of a pictophonetic character", () => {
    const facts = lookupHanzi("吃");
    assert.ok(facts);
    const story = storyFor(facts, lookupHanzi);
    assert.match(story, /口/);
    assert.match(story, /乞/);
    assert.match(story, /sound/);
  });

  it("uses the recorded account for an ideographic character", () => {
    const facts = lookupHanzi("爱");
    assert.ok(facts);
    assert.match(storyFor(facts, lookupHanzi), /friend/i);
  });

  it("says a pictograph is a picture", () => {
    const facts = lookupHanzi("水");
    assert.ok(facts);
    assert.match(storyFor(facts, lookupHanzi), /picture, not a compound/);
  });

  it("admits when the data records parts but no account", () => {
    const facts = lookupHanzi("的");
    assert.ok(facts);
    assert.match(storyFor(facts, lookupHanzi), /no account/);
  });

  it("never trails off into generic advice", () => {
    for (const char of ["吃", "水", "爱", "的", "妈"]) {
      const facts = lookupHanzi(char);
      assert.ok(facts);
      const story = storyFor(facts, lookupHanzi);
      assert.doesNotMatch(story, /is the habit this kind of character rewards/,
        `${char}: boilerplate closing line`);
    }
  });
});

describe("pickCompounds", () => {
  const candidates = [
    { zh: "吃饭", py: "chīfàn", en: "to eat a meal", level: "1", freq: 100 },
    { zh: "好吃", py: "hǎochī", en: "tasty", level: "1", freq: 500 },
    { zh: "吃苦耐劳", py: "chīkǔnàiláo", en: "to bear hardship", level: "7-9", freq: 900 },
    { zh: "吃惊", py: "chījīng", en: "startled", level: "3", freq: 400 },
    { zh: "小吃", py: "xiǎochī", en: "snack", level: "2", freq: 300 },
    { zh: "读书", py: "dúshū", en: "to study", level: "1", freq: 999 },
    { zh: "吃", py: "chī", en: "to eat", level: "1", freq: 999 },
  ];

  it("keeps only words containing the character", () => {
    assert.ok(pickCompounds("吃", candidates).every((w) => w.zh.includes("吃")));
  });

  it("orders by level first, then by how common the word is", () => {
    assert.deepEqual(pickCompounds("吃", candidates).map((w) => w.zh), ["好吃", "吃饭", "小吃", "吃惊"]);
  });

  it("leaves out four-character idioms and the bare character", () => {
    const picked = pickCompounds("吃", candidates).map((w) => w.zh);
    assert.ok(!picked.includes("吃苦耐劳"));
    assert.ok(!picked.includes("吃"));
  });

  it("falls back to idioms when the standard lists no shorter word", () => {
    // 六 and 七 are real cases: HSK 3.0 has them only inside 五颜六色 and
    // 乱七八糟, and an idiom beats an empty "appears in".
    const only = [
      { zh: "七", py: "qī", en: "seven", level: "1" },
      { zh: "乱七八糟", py: "luànqībāzāo", en: "in a mess", level: "7-9" },
    ];
    assert.deepEqual(pickCompounds("七", only).map((w) => w.zh), ["乱七八糟"]);
  });

  it("respects the limit", () => {
    assert.equal(pickCompounds("吃", candidates, 2).length, 2);
  });
});
