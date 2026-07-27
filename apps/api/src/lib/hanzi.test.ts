import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hanziDataCount, idsComponents, lookupHanzi, lookupWithComponents } from "./hanzi.js";

describe("idsComponents", () => {
  it("strips the description operators", () => {
    assert.deepEqual(idsComponents("⿰口乞"), ["口", "乞"]);
    assert.deepEqual(idsComponents("⿱⿱爫冖友"), ["爫", "冖", "友"]);
  });

  it("drops unknown parts and duplicates", () => {
    assert.deepEqual(idsComponents("⿰丨？"), ["丨"]);
    assert.deepEqual(idsComponents("⿰口口"), ["口"]);
  });

  it("returns nothing for an absent decomposition", () => {
    assert.deepEqual(idsComponents(undefined), []);
  });
});

describe("lookupHanzi", () => {
  it("reports the verified structure of a pictophonetic character", () => {
    const facts = lookupHanzi("吃");
    assert.ok(facts);
    assert.equal(facts.decomposition, "⿰口乞");
    assert.deepEqual(facts.components, ["口", "乞"]);
    assert.equal(facts.radical, "口");
    assert.deepEqual(facts.readings, ["chī"]);
    assert.equal(facts.strokes, 6);
    assert.equal(facts.etymology?.type, "pictophonetic");
    assert.equal(facts.etymology?.semantic, "口");
    assert.equal(facts.etymology?.phonetic, "乞");
  });

  it("carries a gloss for component characters that rarely stand alone", () => {
    const facts = lookupHanzi("冖");
    assert.ok(facts);
    assert.match(facts.gloss ?? "", /cover|roof/i);
  });

  it("returns null rather than a guess for an unlisted character", () => {
    assert.equal(lookupHanzi("A"), null);
    assert.equal(lookupHanzi("𠀀"), null);
  });

  it("never lists the character as its own component", () => {
    for (const char of ["水", "龙", "爱", "好"]) {
      assert.ok(!lookupHanzi(char)?.components.includes(char), `${char} decomposes into itself`);
    }
  });
});

describe("lookupWithComponents", () => {
  it("resolves each component to its own facts", () => {
    const found = lookupWithComponents("妈");
    assert.ok(found);
    assert.deepEqual(found.components.map((c) => c.hanzi), ["女", "马"]);
    assert.deepEqual(found.components.map((c) => c.readings[0]), ["nǚ", "mǎ"]);
  });

  it("skips components the dataset does not list, rather than inventing them", () => {
    const found = lookupWithComponents("吃");
    assert.ok(found);
    assert.ok(found.components.every((c) => c.gloss));
  });
});

describe("bundled dataset", () => {
  it("covers the common character range", () => {
    assert.ok(hanziDataCount() > 9000, `only ${hanziDataCount()} characters bundled`);
  });
});
