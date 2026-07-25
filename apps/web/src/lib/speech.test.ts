import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickVoiceFrom } from "./speech.js";

const v = (lang: string, name = lang) => ({ lang, name });

describe("pickVoiceFrom", () => {
  it("returns null when no Chinese voice is installed", () => {
    assert.equal(pickVoiceFrom([v("en-US"), v("fr-FR")]), null);
    assert.equal(pickVoiceFrom([]), null);
  });

  it("prefers mainland Mandarin over other Chinese locales", () => {
    const picked = pickVoiceFrom([v("zh-TW"), v("zh-HK"), v("zh-CN"), v("zh")]);
    assert.equal(picked?.lang, "zh-CN");
  });

  it("ranks Cantonese (zh-HK) and zh-TW below generic zh", () => {
    assert.equal(pickVoiceFrom([v("zh-HK"), v("zh")])?.lang, "zh");
    assert.equal(pickVoiceFrom([v("zh-TW"), v("zh")])?.lang, "zh");
  });

  it("accepts underscore locale separators", () => {
    assert.equal(pickVoiceFrom([v("en-US"), v("zh_CN")])?.lang, "zh_CN");
  });

  it("is case-insensitive about the locale tag", () => {
    assert.equal(pickVoiceFrom([v("ZH-cn")])?.lang, "ZH-cn");
  });

  it("falls back to any Chinese voice when the preferred ones are absent", () => {
    assert.equal(pickVoiceFrom([v("en-GB"), v("zh-SG")])?.lang, "zh-SG");
  });
});
