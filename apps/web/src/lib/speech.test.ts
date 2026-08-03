import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickVoiceFrom, speechHint } from "./speech.js";

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

describe("speechHint", () => {
  /**
   * Pronunciation used to render nothing at all when no Mandarin voice was
   * installed, which on a stock Windows machine is the default state — so the
   * commonest case was indistinguishable from the feature not existing, and
   * the one thing that fixes it was never mentioned anywhere in the app.
   */
  it("says nothing when pronunciation works", () => {
    assert.equal(speechHint("ready"), null);
  });

  it("names the fix when the device has no Mandarin voice", () => {
    const hint = speechHint("no-voice");
    assert.ok(hint, "a missing voice must be explained, not silent");
    assert.match(hint!, /chinese/i, "should name the language pack to install");
  });

  it("distinguishes a browser that cannot speak at all", () => {
    const hint = speechHint("unsupported");
    assert.ok(hint);
    assert.notEqual(hint, speechHint("no-voice"),
      "an unsupported browser and a missing voice need different advice");
  });

  it("never suggests a workaround that would teach a wrong reading", () => {
    // An en-US voice reading chá is worse than silence, so no hint may point
    // at "use the English voice instead".
    for (const s of ["no-voice", "unsupported"] as const) {
      assert.doesNotMatch(speechHint(s)!, /english/i);
    }
  });
});
