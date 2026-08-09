import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AzureSynthesizer, DEFAULT_VOICE, synthesizerFromEnv, TtsError } from "./tts.js";

/** Stand in for the network so the contract is testable without a key. */
function stubFetch(res: { ok?: boolean; status?: number; payload?: Buffer }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const payload = res.payload ?? Buffer.from("mp3");
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
      text: async () => payload.toString(),
    } as unknown as Response;
  };
  return { fake, calls };
}

describe("synthesizerFromEnv", () => {
  it("is null when no key is configured, so a deploy without one still runs", () => {
    // Audio is an enhancement layered on reference data. Missing credentials
    // must degrade to the browser voice, never fail a boot or a seed.
    assert.equal(synthesizerFromEnv({}), null);
    assert.equal(synthesizerFromEnv({ AZURE_SPEECH_REGION: "eastus" }), null);
    assert.equal(synthesizerFromEnv({ AZURE_SPEECH_KEY: "k" }), null);
  });

  it("builds one when both key and region are present", () => {
    const s = synthesizerFromEnv({ AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastus" });
    assert.ok(s);
    assert.equal(s!.voice, DEFAULT_VOICE);
  });

  it("honours a voice override", () => {
    const s = synthesizerFromEnv({
      AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastus",
      AZURE_SPEECH_VOICE: "zh-CN-YunxiNeural",
    });
    assert.equal(s!.voice, "zh-CN-YunxiNeural");
  });
});

describe("AzureSynthesizer", () => {
  it("refuses credentials it cannot use", () => {
    assert.throws(() => new AzureSynthesizer("", "eastus"), TtsError);
    assert.throws(() => new AzureSynthesizer("k", ""), TtsError);
  });

  /**
   * The reason this whole feature exists. A reading that cannot be pinned must
   * not be synthesised: the engine would pick for us, and on a polyphonic
   * character it picks wrong about half the time. A silent card falls back to
   * the browser voice; a wrong one is drilled as if it were right.
   */
  it("refuses to synthesise a reading it cannot pin", async () => {
    const s = new AzureSynthesizer("k", "eastus");
    await assert.rejects(() => s.speak({ hanzi: "行", pinyin: "???" }), TtsError);
  });

  it("sends SSML carrying the pinned reading", async () => {
    const { fake, calls } = stubFetch({});
    const original = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    try {
      const s = new AzureSynthesizer("secret-key", "westeurope");
      const clip = await s.speak({ hanzi: "行", pinyin: "xíng" });

      const [{ url, init }] = calls;
      assert.match(url, /westeurope\.tts\.speech\.microsoft\.com/);
      assert.equal((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "secret-key");
      assert.match(String(init.body), /ph="xing2"/, "the reading must be pinned in the SSML");
      assert.equal(clip.phoneme, "xing2");
      assert.equal(clip.voice, DEFAULT_VOICE);
      assert.equal(clip.mime, "audio/mpeg");
      assert.ok(clip.audio.length, "a clip must carry audio");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("distinguishes the two readings of the same character", async () => {
    const { fake, calls } = stubFetch({});
    const original = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    try {
      const s = new AzureSynthesizer("k", "eastus");
      const a = await s.speak({ hanzi: "行", pinyin: "xíng" });
      const b = await s.speak({ hanzi: "行", pinyin: "háng" });
      assert.notEqual(a.phoneme, b.phoneme, "同字异读 must not collapse to one clip");
      assert.match(String(calls[0].init.body), /xing2/);
      assert.match(String(calls[1].init.body), /hang2/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("surfaces the provider's own error text, not just a status", async () => {
    const { fake } = stubFetch({ ok: false, status: 401, payload: Buffer.from("Invalid subscription key") });
    const original = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    try {
      const s = new AzureSynthesizer("bad", "eastus");
      await assert.rejects(
        () => s.speak({ hanzi: "茶", pinyin: "chá" }),
        (e: Error) => /401/.test(e.message) && /Invalid subscription key/.test(e.message),
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("treats an empty response as a failure rather than a silent clip", async () => {
    const { fake } = stubFetch({ ok: true, payload: Buffer.alloc(0) });
    const original = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    try {
      const s = new AzureSynthesizer("k", "eastus");
      await assert.rejects(() => s.speak({ hanzi: "茶", pinyin: "chá" }), TtsError);
    } finally {
      globalThis.fetch = original;
    }
  });
});
