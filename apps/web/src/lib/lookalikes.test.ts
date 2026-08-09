import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookAlikesOf, looksLike } from "./lookalikes.js";

/**
 * These assert against the generated map, not a fixture, because the map is the
 * thing that can be wrong. A rebuild that quietly stopped seeing 木 and 本 as
 * confusable would leave every unit here passing against a mock while read mode
 * went back to the weaker test.
 */
describe("looksLike", () => {
  it("catches the pairs that break reading in the wild", () => {
    // The canonical misreadings: a sign, a menu, a subtitle. If the generator
    // ever stops finding these, it has stopped earning its 79 KB.
    for (const [a, b] of [
      ["木", "本"], ["未", "末"], ["日", "曰"], ["日", "目"],
      ["土", "士"], ["人", "入"], ["干", "千"], ["己", "已"],
      ["我", "找"], ["很", "根"],
    ]) {
      assert.ok(looksLike(a, b), `${a} and ${b} should be confusable`);
    }
  });

  it("is not fooled by a shared radical", () => {
    // The cheap alternative — same radical, near stroke count — would call all
    // of these confusable. 口 is a third of each glyph and the rest is not
    // close, which is why the map is built from geometry instead.
    for (const [a, b] of [["咖", "吃"], ["咖", "叫"], ["啡", "吃"]]) {
      assert.ok(!looksLike(a, b), `${a} and ${b} do not look alike`);
    }
  });

  it("holds in both directions", () => {
    // Confusability is mutual, but the generator's per-character cut and its
    // cap on list length are not: 找 sits in a crowd of 扌 characters and lists
    // ten of them before it would reach 我. Asking either way has to work, or
    // whether a card gets its look-alike depends on which one is under test.
    assert.ok(lookAlikesOf("我").includes("找"));
    assert.ok(!lookAlikesOf("找").includes("我"));
    assert.equal(looksLike("我", "找"), looksLike("找", "我"));
    assert.ok(looksLike("找", "我"));
  });

  it("does not call a character a misreading of itself", () => {
    assert.ok(!looksLike("木", "木"));
    assert.ok(!looksLike("咖啡", "咖啡"));
  });

  it("says nothing about characters it has never seen", () => {
    // Cards can hold anything the learner imported, including characters
    // outside the dex the map was built from. No data is not a crash.
    assert.equal(lookAlikesOf("𠀀"), "");
    assert.ok(!looksLike("𠀀", "木"));
    assert.ok(!looksLike("", ""));
  });
});

describe("looksLike, on words", () => {
  it("treats a word as misread when one character is", () => {
    // 未来 read as 末来 is the same failure as 未 read as 末, and a card can be
    // a word — bank cards are not all single characters.
    assert.ok(looksLike("未来", "末来"));
    assert.ok(looksLike("木头", "本头"));
  });

  it("is not a misreading when two characters differ at once", () => {
    // Both halves wrong is not a slip of the eye, it is a different word. Note
    // this pair passes character by character — 未/末 are confusable and so are
    // 来/末 — so only the one-slip rule rules it out.
    assert.ok(looksLike("未", "末") && looksLike("来", "末"));
    assert.ok(!looksLike("未来", "末末"));
  });

  it("is not a misreading when the words are different lengths", () => {
    assert.ok(!looksLike("木", "木头"));
    assert.ok(!looksLike("咖啡", "咖"));
  });

  it("needs at least one character to actually differ", () => {
    assert.ok(!looksLike("未来", "未来"));
  });
});

describe("the generated map", () => {
  it("never lists a character as its own look-alike", () => {
    for (const ch of ["木", "日", "我", "土", "未", "己", "水", "很"]) {
      assert.ok(!lookAlikesOf(ch).includes(ch), `${ch} lists itself`);
    }
  });

  it("keeps lists short enough to stay meaningful", () => {
    // Past ten the tail is noise, and every entry is a slot that could have
    // held a distractor ranked on meaning instead.
    for (const ch of ["木", "日", "我", "土", "未", "请", "很"]) {
      assert.ok(lookAlikesOf(ch).length <= 10, `${ch} has ${lookAlikesOf(ch).length}`);
    }
  });
});
