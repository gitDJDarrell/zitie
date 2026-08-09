import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPhoneme, toSsml } from "./pinyin.js";

describe("toPhoneme", () => {
  it("converts a single tone-marked syllable", () => {
    assert.equal(toPhoneme("chá"), "cha2");
    assert.equal(toPhoneme("mǐ"), "mi3");
    assert.equal(toPhoneme("fàn"), "fan4");
    assert.equal(toPhoneme("kā"), "ka1");
  });

  /**
   * The whole point. 行 is xíng or háng and a bare glyph gives the engine no
   * way to choose; the card already knows which one it means, so the phoneme
   * carries it. A wrong tone drilled repeatedly is worse than silence.
   */
  it("pins the reading of a polyphonic character", () => {
    assert.equal(toPhoneme("xíng"), "xing2");   // 行 as in 不行
    assert.equal(toPhoneme("háng"), "hang2");   // 行 as in 银行
    assert.equal(toPhoneme("hái"), "hai2");     // 还 as in 还是
    assert.equal(toPhoneme("huán"), "huan2");   // 还 as in 还书
    assert.equal(toPhoneme("hǎo"), "hao3");
    assert.equal(toPhoneme("hào"), "hao4");
  });

  it("splits multi-syllable pinyin written without spaces", () => {
    // Card examples arrive both ways: "hē chá" but also "kāfēi", "mǐfàn".
    assert.equal(toPhoneme("kāfēi"), "ka1 fei1");
    assert.equal(toPhoneme("mǐfàn"), "mi3 fan4");
    assert.equal(toPhoneme("nǐhǎo"), "ni3 hao3");
  });

  it("honours separators the source already gives", () => {
    assert.equal(toPhoneme("hē chá"), "he1 cha2");
    assert.equal(toPhoneme("rè chá"), "re4 cha2");
  });

  it("marks an unmarked syllable neutral rather than first tone", () => {
    // 的 is genuinely toneless here; calling it dē would be a different word.
    assert.equal(toPhoneme("de"), "de5");
    assert.equal(toPhoneme("xièxie"), "xie4 xie5");
  });

  it("accepts numeric tone notation", () => {
    assert.equal(toPhoneme("cha2"), "cha2");
    assert.equal(toPhoneme("ni3hao3"), "ni3 hao3");
    assert.equal(toPhoneme("de5"), "de5");
  });

  it("handles ü in both spellings", () => {
    assert.equal(toPhoneme("lǜ"), "lv4");
    assert.equal(toPhoneme("nü3"), "nv3");
  });

  it("parses an untoned multi-syllable reading into the right syllables", () => {
    // Boundary placement, independent of tones: ka|fei, not kaf|ei or ka|f|ei.
    assert.equal(toPhoneme("kafei"), "ka5 fei5");
    assert.equal(toPhoneme("yinhang"), "yin5 hang5");
    assert.equal(toPhoneme("tushuguan"), "tu5 shu5 guan5");
  });

  /**
   * Refusing is a feature. Anything unparseable must come back null so the
   * generator skips the clip — a character with no audio falls back to the
   * browser voice, whereas a mis-synthesised one teaches the wrong sound with
   * no signal that anything went wrong.
   */
  it("returns null rather than guessing", () => {
    assert.equal(toPhoneme(""), null);
    assert.equal(toPhoneme("   "), null);
    assert.equal(toPhoneme("xyzzy"), null);
    assert.equal(toPhoneme("coffee"), null);
  });
});

describe("toSsml", () => {
  it("pins the reading when the pinyin parses", () => {
    const ssml = toSsml("行", "xíng");
    assert.match(ssml, /alphabet="sapi"/);
    assert.match(ssml, /ph="xing2"/);
    assert.match(ssml, />行</);
  });

  it("still speaks, unpinned, when the pinyin does not parse", () => {
    // Better the engine's guess than no audio at all here — this path is only
    // reached for readings we could not parse, and the caller decides whether
    // to keep the result.
    const ssml = toSsml("茶", "???");
    assert.doesNotMatch(ssml, /phoneme/);
    assert.match(ssml, />茶</);
  });

  it("names the voice and slows slightly for study", () => {
    const ssml = toSsml("茶", "chá", "zh-CN-YunxiNeural");
    assert.match(ssml, /name="zh-CN-YunxiNeural"/);
    assert.match(ssml, /rate="-10%"/);
    assert.match(ssml, /xml:lang="zh-CN"/);
  });

  it("escapes anything that would break the document", () => {
    const ssml = toSsml("<&>", "chá");
    assert.doesNotMatch(ssml.replace(/<\/?(speak|voice|prosody|phoneme)[^>]*>/g, ""), /[<>]/);
    assert.match(ssml, /&lt;&amp;&gt;/);
  });
});
