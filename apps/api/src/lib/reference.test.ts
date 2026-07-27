import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileCards, type ReferenceWord } from "./reference.js";

const REFERENCE = new Map<string, ReferenceWord>([
  ["长", { pinyin: "cháng", meaning: "length; long", pos: ["adjective"], compound: false, level: "2" }],
  ["图书馆", { pinyin: "túshūguǎn", meaning: "library", pos: [], compound: true, level: "1" }],
]);

describe("reconcileCards", () => {
  it("replaces a misread reading with the standard's", () => {
    const [card] = reconcileCards([{ hanzi: "长", pinyin: "zhǎng", meaning: "long" }], REFERENCE);
    assert.equal(card.pinyin, "cháng");
  });

  it("keeps the extracted gloss — it was written for a flashcard", () => {
    const [card] = reconcileCards([{ hanzi: "图书馆", pinyin: "tushuguan", meaning: "library (place to borrow books)" }], REFERENCE);
    assert.equal(card.meaning, "library (place to borrow books)");
    assert.equal(card.pinyin, "túshūguǎn");
  });

  it("fills in a missing gloss from the standard", () => {
    const [card] = reconcileCards([{ hanzi: "图书馆", meaning: "" }], REFERENCE);
    assert.equal(card.meaning, "library");
  });

  it("fills in parts of speech only when the extraction gave none", () => {
    const [filled] = reconcileCards([{ hanzi: "长", pos: [] }], REFERENCE);
    assert.deepEqual(filled.pos, ["adjective"]);
    const [kept] = reconcileCards([{ hanzi: "长", pos: ["verb"] }], REFERENCE);
    assert.deepEqual(kept.pos, ["verb"]);
  });

  it("corrects whether the entry is a compound", () => {
    const [card] = reconcileCards([{ hanzi: "图书馆", compound: false }], REFERENCE);
    assert.equal(card.compound, true);
  });

  it("leaves a word outside the standard exactly as extracted", () => {
    const card = { hanzi: "微博", pinyin: "wēibó", meaning: "Weibo" };
    assert.deepEqual(reconcileCards([card], REFERENCE)[0], card);
  });

  it("passes through an entry with no hanzi rather than throwing", () => {
    assert.deepEqual(reconcileCards([{ pinyin: "??" }], REFERENCE), [{ pinyin: "??" }]);
  });
});
