import { toPhoneme, toSsml } from "./pinyin.js";

/* ————————————————— speech synthesis —————————————————

   Audio is reference data, not a per-request service: 茶 sounds the same for
   every user forever, so a clip is synthesised once, stored, and served from
   the database like stroke geometry and character breakdowns. Nothing here runs
   on the hot path — it runs in the seeding step, and the app reads rows.

   Behind an interface because the provider is an implementation detail and
   because the generator has to be testable without anyone's key. */

export const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

export interface Utterance {
  hanzi: string;
  pinyin: string;
}

export interface Clip {
  hanzi: string;
  pinyin: string;
  /** Azure sapi form actually used, so a stored clip can be matched later. */
  phoneme: string;
  voice: string;
  mime: string;
  /** base64 audio. */
  audio: string;
}

export interface Synthesizer {
  readonly voice: string;
  speak(u: Utterance): Promise<Clip>;
}

export class TtsError extends Error {}

/**
 * Azure Speech, via the REST endpoint rather than the SDK — one HTTPS call
 * with an SSML body, no dependency to carry for something this small.
 *
 * MP3 at 24 kHz mono: these clips are one or two syllables, so the format
 * costs a few KB each and plays everywhere without a decoder question.
 */
export class AzureSynthesizer implements Synthesizer {
  constructor(
    private readonly key: string,
    private readonly region: string,
    readonly voice: string = DEFAULT_VOICE,
  ) {
    if (!key) throw new TtsError("AZURE_SPEECH_KEY is required to synthesise audio.");
    if (!region) throw new TtsError("AZURE_SPEECH_REGION is required (e.g. eastus).");
  }

  async speak({ hanzi, pinyin }: Utterance): Promise<Clip> {
    const phoneme = toPhoneme(pinyin);
    // The caller is expected to have filtered these out; refusing here too so a
    // new caller can't quietly ship a clip whose reading was a guess.
    if (!phoneme) throw new TtsError(`Cannot pin the reading of ${hanzi} from "${pinyin}".`);

    const res = await fetch(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "zitie",
        },
        body: toSsml(hanzi, pinyin, this.voice),
      },
    );

    if (!res.ok) {
      // Azure puts the useful part in the body, not the status text.
      const detail = await res.text().catch(() => "");
      throw new TtsError(`Azure TTS ${res.status} for ${hanzi}: ${detail.slice(0, 200)}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new TtsError(`Azure returned an empty clip for ${hanzi}.`);

    return {
      hanzi, pinyin, phoneme,
      voice: this.voice,
      mime: "audio/mpeg",
      audio: audio.toString("base64"),
    };
  }
}

/** Build a synthesiser from the environment, or null when no key is configured. */
export function synthesizerFromEnv(env = process.env): Synthesizer | null {
  const key = env.AZURE_SPEECH_KEY;
  const region = env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;
  return new AzureSynthesizer(key, region, env.AZURE_SPEECH_VOICE || DEFAULT_VOICE);
}
