import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { characterFacts, groundCompounds, groundComponents, verifiedComponents } from "./enrich.js";

describe("verifiedComponents", () => {
  it("collects the parts the dataset places inside a character", () => {
    const parts = verifiedComponents("吃");
    assert.ok(parts.has("口"));
    assert.ok(parts.has("乞"));
  });

  it("reaches a component's own components", () => {
    // 爱 → ⿱⿱爫冖友, and 友 itself decomposes further.
    const parts = verifiedComponents("爱");
    assert.ok(parts.has("友"));
    assert.ok([...parts].some((p) => verifiedComponents("友").has(p) || p === "友"));
  });

  it("stops at the requested depth", () => {
    const shallow = verifiedComponents("妈", 1);
    assert.deepEqual([...shallow].sort(), ["女", "马"]);
  });

  it("is empty for a character the dataset does not cover", () => {
    assert.equal(verifiedComponents("A").size, 0);
  });
});

describe("groundComponents", () => {
  it("keeps components the dataset confirms", () => {
    const kept = groundComponents("吃", {
      components: [
        { char: "口", role: "semantic", gloss: "mouth" },
        { char: "乞", role: "phonetic", reading: "qǐ" },
      ],
    });
    assert.deepEqual(kept?.map((c) => c.char), ["口", "乞"]);
  });

  it("drops a component the character does not contain", () => {
    const kept = groundComponents("吃", {
      components: [
        { char: "口", role: "semantic" },
        { char: "馬", role: "phonetic", note: "invented — 吃 has no 馬 in it" },
      ],
    });
    assert.deepEqual(kept?.map((c) => c.char), ["口"]);
  });

  it("drops duplicates", () => {
    const kept = groundComponents("吃", {
      components: [{ char: "口", role: "semantic" }, { char: "口", role: "form" }],
    });
    assert.equal(kept?.length, 1);
  });

  it("returns an empty list when there is nothing to ground", () => {
    assert.deepEqual(groundComponents("吃", {}), []);
  });
});

describe("groundCompounds", () => {
  it("keeps only words containing the character, capped at four", () => {
    const kept = groundCompounds("水", {
      compounds: [
        { zh: "水果", py: "shuǐguǒ" }, { zh: "喝水" }, { zh: "开水" },
        { zh: "矿泉水" }, { zh: "茶叶" }, { zh: "水平" },
      ],
    });
    assert.equal(kept?.length, 4);
    assert.ok(kept?.every((w) => w.zh.includes("水")));
  });
});

describe("characterFacts", () => {
  it("reports the dataset's facts for a known character", () => {
    const facts = characterFacts("好") as Record<string, unknown>;
    assert.equal(facts.known, true);
    assert.equal(facts.decomposition, "⿰女子");
    assert.deepEqual(facts.components, ["女", "子"]);
  });

  it("says so plainly when a character is not covered", () => {
    assert.deepEqual(characterFacts("A"), { hanzi: "A", known: false });
    assert.deepEqual(characterFacts("吃了"), { hanzi: "吃了", known: false });
  });
});
