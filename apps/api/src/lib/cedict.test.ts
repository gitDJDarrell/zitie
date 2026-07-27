import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanGloss, parseCedict, parseCedictLine, parseHskWordlist, syllableToneMarks, toneMarks } from "./cedict.js";

describe("syllableToneMarks", () => {
  it("marks the main vowel", () => {
    assert.equal(syllableToneMarks("hao3"), "hǎo");
    assert.equal(syllableToneMarks("ma1"), "mā");
    assert.equal(syllableToneMarks("shui3"), "shuǐ");
  });

  it("puts the mark on the second vowel of iu and ui", () => {
    assert.equal(syllableToneMarks("liu2"), "liú");
    assert.equal(syllableToneMarks("gui4"), "guì");
  });

  it("prefers a over o and e", () => {
    assert.equal(syllableToneMarks("jiao1"), "jiāo");
    assert.equal(syllableToneMarks("jue2"), "jué");
  });

  it("handles ü, written u: in the source", () => {
    assert.equal(syllableToneMarks("lu:4"), "lǜ");
    assert.equal(syllableToneMarks("nu:3"), "nǚ");
  });

  it("leaves the neutral tone unmarked", () => {
    assert.equal(syllableToneMarks("ma5"), "ma");
    assert.equal(syllableToneMarks("de"), "de");
  });
});

describe("toneMarks", () => {
  it("runs a word's syllables together", () => {
    assert.equal(toneMarks("ai4 hao4"), "àihào");
    assert.equal(toneMarks("tu2 shu1 guan3"), "túshūguǎn");
  });

  it("inserts an apostrophe before a vowel-initial syllable", () => {
    assert.equal(toneMarks("ke3 ai4"), "kě'ài");
    assert.equal(toneMarks("xi1 an1"), "xī'ān");
  });
});

describe("cleanGloss", () => {
  it("joins the leading senses", () => {
    assert.equal(cleanGloss(["to like", "keen on"]), "to like; keen on");
  });

  it("drops classifiers and cross-references", () => {
    assert.equal(cleanGloss(["library", "CL:家[jia1]"]), "library");
    assert.equal(cleanGloss(["see 吗啡[ma3 fei1]", "morphine"]), "morphine");
  });

  it("sorts proper nouns behind ordinary senses", () => {
    const gloss = cleanGloss(["Yaksu in North Korea", "medicine in liquid form"]);
    assert.match(gloss, /^medicine in liquid form/);
  });

  it("trims to the requested length", () => {
    const gloss = cleanGloss(["a".repeat(50), "b".repeat(50)], 60);
    assert.ok(gloss.length <= 60, gloss);
  });

  it("is empty when nothing useful survives", () => {
    assert.equal(cleanGloss(["CL:個|个[ge4]", "variant of 麽[me5]"]), "");
  });
});

describe("parseCedict", () => {
  const FILE = [
    "# CC-CEDICT",
    "嗎 吗 [ma3] /see 吗啡[ma3 fei1]/",
    "嗎 吗 [ma5] /(question tag)/",
    "藥水 药水 [yao4 shui3] /Yaksu in North Korea/",
    "藥水 药水 [yao4 shui3] /medicine in liquid form/",
    "愛好 爱好 [ai4 hao4] /to like/hobby/",
  ].join("\n");

  it("keys entries by their simplified form", () => {
    const dict = parseCedict(FILE);
    assert.equal(dict.get("爱好")?.py, "àihào");
    assert.equal(dict.get("爱好")?.en, "to like; hobby");
  });

  it("merges senses of the same reading", () => {
    assert.match(parseCedict(FILE).get("药水")?.en ?? "", /medicine in liquid form/);
  });

  it("skips past a reading that only cross-references", () => {
    const entry = parseCedict(FILE).get("吗");
    assert.equal(entry?.py, "ma");
    assert.equal(entry?.en, "(question tag)");
  });

  it("returns nothing for an unparseable line", () => {
    assert.equal(parseCedictLine("not a dictionary line"), null);
  });

  it("picks the reading with the most recorded senses", () => {
    const dict = parseCedict([
      "打 打 [da2] /dozen/",
      "打 打 [da3] /to hit/to strike/to play/to fetch/",
    ].join("\n"));
    assert.equal(dict.get("打")?.py, "dǎ");
    assert.match(dict.get("打")?.en ?? "", /to hit/);
  });

  it("honours a preferred reading, and glosses that reading", () => {
    const file = [
      "長 长 [chang2] /length/long/",
      "長 长 [zhang3] /chief/to grow/elder/senior/",
    ].join("\n");
    const dict = parseCedict(file, new Map([["长", "cháng"]]));
    assert.equal(dict.get("长")?.py, "cháng");
    assert.match(dict.get("长")?.en ?? "", /length/);
    assert.doesNotMatch(dict.get("长")?.en ?? "", /chief/);
  });

  it("ignores a preferred reading the dictionary doesn't have", () => {
    const dict = parseCedict("打 打 [da3] /to hit/", new Map([["打", "dà"]]));
    assert.equal(dict.get("打")?.py, "dǎ");
  });
});

describe("parseHskWordlist", () => {
  const LIST = [
    "# HSK 3.0 word list",
    "一级词汇表",
    "1 爱",
    "2 爸爸｜爸",
    "3 白（形）",
    "二级词汇表",
    "1 白（副）",
    "2 称¹",
    "七一九级词汇表",
    "1 称²",
  ].join("\n");

  it("tags each word with the level it is listed under", () => {
    const words = parseHskWordlist(LIST);
    assert.equal(words.find((w) => w.zh === "爱")?.level, "1");
  });

  it("splits accepted variant forms into separate entries", () => {
    const forms = parseHskWordlist(LIST).map((w) => w.zh);
    assert.ok(forms.includes("爸爸"));
    assert.ok(forms.includes("爸"));
  });

  it("reads the standard's part-of-speech annotations", () => {
    assert.deepEqual(parseHskWordlist(LIST).find((w) => w.zh === "白")?.pos, ["adjective", "adverb"]);
  });

  it("merges a form listed at several levels, earliest first", () => {
    const white = parseHskWordlist(LIST).find((w) => w.zh === "白");
    assert.equal(white?.level, "1");
    assert.deepEqual(white?.levels, ["1", "2"]);
  });

  it("strips the superscripts that number repeated senses", () => {
    const cheng = parseHskWordlist(LIST).find((w) => w.zh === "称");
    assert.ok(cheng, "称 should survive with its superscript stripped");
    assert.deepEqual(cheng.levels, ["2", "7-9"]);
  });

  it("recognises the combined advanced tier as 7-9", () => {
    assert.ok(parseHskWordlist(LIST).some((w) => w.levels.includes("7-9")));
  });
});
