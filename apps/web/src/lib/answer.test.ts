import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkAnswer } from "./answer.js";

const cha = { hanzi: "茶", pinyin: "chá" };
const nihao = { hanzi: "你好", pinyin: "nǐ hǎo" };

describe("checkAnswer", () => {
  it("accepts the exact characters", () => {
    assert.equal(checkAnswer("茶", cha), "hanzi");
    assert.equal(checkAnswer("你好", nihao), "hanzi");
  });

  it("accepts pinyin with tone marks", () => {
    assert.equal(checkAnswer("chá", cha), "pinyin");
    assert.equal(checkAnswer("nǐ hǎo", nihao), "pinyin");
  });

  it("accepts pinyin without tones — not every keyboard can type them", () => {
    assert.equal(checkAnswer("cha", cha), "pinyin");
    assert.equal(checkAnswer("nihao", nihao), "pinyin");
    assert.equal(checkAnswer("ni hao", nihao), "pinyin");
  });

  it("accepts numeric tone notation", () => {
    assert.equal(checkAnswer("cha2", cha), "pinyin");
    assert.equal(checkAnswer("ni3hao3", nihao), "pinyin");
  });

  it("ignores case and surrounding whitespace", () => {
    assert.equal(checkAnswer("  CHÁ  ", cha), "pinyin");
    assert.equal(checkAnswer(" 茶 ", cha), "hanzi");
  });

  it("rejects a wrong answer", () => {
    assert.equal(checkAnswer("shui", cha), null);
    assert.equal(checkAnswer("水", cha), null);
  });

  it("rejects empty or whitespace-only input", () => {
    assert.equal(checkAnswer("", cha), null);
    assert.equal(checkAnswer("   ", cha), null);
  });

  it("does not let a blank pinyin field match everything", () => {
    // A card with no reading recorded shouldn't accept arbitrary latin text.
    assert.equal(checkAnswer("anything", { hanzi: "茶", pinyin: "" }), null);
  });

  it("prefers the hanzi reading when input could be read as either", () => {
    // Degenerate case: a "hanzi" that is itself latin text matching the pinyin.
    assert.equal(checkAnswer("ok", { hanzi: "ok", pinyin: "ok" }), "hanzi");
  });
});
