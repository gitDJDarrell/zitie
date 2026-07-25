// Mandarin text-to-speech via the Web Speech API.
//
// Deliberately not a paid TTS service: speechSynthesis ships in every target
// browser and in the Capacitor WebView, costs nothing per call, works offline
// once the OS voice is installed, and has no latency. Quality depends on the
// device voice (very good on iOS/macOS and modern Android, serviceable on
// Windows). If we ever want consistent studio audio, swap the body of speak()
// for a cached server endpoint — callers don't need to change.

let voice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/** Just the part of a voice we rank on — keeps the logic testable off-DOM. */
export interface VoiceLike { lang: string }

/**
 * Preference order among Chinese voices. Mainland Mandarin first, since the
 * app teaches simplified characters and pinyin; Taiwan/Hong Kong voices rank
 * last because they carry a different reading tradition (and zh-HK is
 * Cantonese, which would actively mislead a Mandarin learner).
 */
export function rankVoice(v: VoiceLike): number {
  const lang = v.lang.toLowerCase().replace(/_/g, "-");
  if (lang.startsWith("zh-cn")) return 0;
  if (lang.startsWith("zh-hans")) return 1;
  if (lang === "zh") return 2;
  if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk")) return 4;
  return 3;
}

/** Best Mandarin voice from a list, or null if none of them are Chinese. */
export function pickVoiceFrom<T extends VoiceLike>(all: readonly T[]): T | null {
  const zh = all.filter(v => v.lang.toLowerCase().replace(/_/g, "-").startsWith("zh"));
  if (!zh.length) return null;
  return [...zh].sort((a, b) => rankVoice(a) - rankVoice(b))[0] ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  return pickVoiceFrom(s.getVoices());
}

/**
 * Voice lists load asynchronously in most browsers — the first getVoices()
 * often returns []. Call this once at startup so a voice is ready by the time
 * the user reveals their first card.
 */
export function initSpeech(): void {
  const s = synth();
  if (!s) return;
  const load = () => {
    const picked = pickVoice();
    if (picked) { voice = picked; voicesReady = true; }
  };
  load();
  if (!voicesReady) s.addEventListener("voiceschanged", load, { once: false });
}

/** Is Mandarin TTS usable on this device right now? */
export function canSpeak(): boolean {
  const s = synth();
  if (!s) return false;
  if (!voice) voice = pickVoice();
  return !!voice;
}

/**
 * Speak Chinese text. Cancels anything already speaking so rapid taps don't
 * queue up a backlog. No-ops silently when no Mandarin voice is installed —
 * audio is an enhancement, never a blocker.
 */
export function speak(text: string): void {
  const s = synth();
  if (!s || !text.trim()) return;
  if (!voice) voice = pickVoice();
  if (!voice) return;

  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.85; // a touch slower than default — these are study prompts
  s.speak(u);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
