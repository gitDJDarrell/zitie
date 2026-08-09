/**
 * Fills character_audio with spoken clips.
 *
 * Separate from `db:seed-reference` on purpose. That step ships with a release
 * and must run everywhere; this one needs an Azure key, costs money the first
 * time, and only ever needs running when new characters or a new voice arrive.
 * Folding it in would make every deploy depend on a credential the app itself
 * does not need.
 *
 * Idempotent and resumable: it asks the database what it already has and
 * synthesises only the gap, so an interrupted run is re-run, not restarted.
 *
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=eastus npm run db:seed-audio
 *   npm run db:seed-audio -- --limit 20        # try a handful first
 *   npm run db:seed-audio -- --chars-only      # characters only, for a trial
 *   npm run db:seed-audio -- --voice zh-CN-YunxiNeural --force
 *
 * Run it after db:seed-reference: the readings it speaks come from the word
 * bank that step populates.
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { characterAudio, hskWords } from "../src/db/schema.js";
import { toPhoneme } from "../src/lib/pinyin.js";
import { synthesizerFromEnv, type Clip, type Utterance } from "../src/lib/tts.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

/**
 * What to speak, and with which reading.
 *
 * Sourced from hsk_words rather than any raw dictionary, because that table's
 * readings have already been through build-reference-data's disambiguation —
 * including data/readings-override.json, the hand-checked list of heteronyms
 * the sense-count heuristic gets wrong (打 is dǎ, not dá). Re-deriving readings
 * here would quietly discard that work and reintroduce exactly the errors this
 * feature exists to prevent.
 *
 * Characters and words both, because a word is not the sum of its characters
 * out loud: 咖啡 is kāfēi, and tone sandhi means 你好 is said níhǎo however 你
 * is said alone. Voicing only the characters would leave every word either
 * silent or stitched together from clips that are individually right and
 * jointly wrong. `--chars-only` narrows it when trialling.
 */
async function corpus(charsOnly: boolean): Promise<{ wanted: Utterance[]; unpinnable: string[] }> {
  const rows = await db
    .select({ zh: hskWords.zh, pinyin: hskWords.pinyin })
    .from(hskWords)
    .where(charsOnly ? sql`char_length(${hskWords.zh}) = 1` : sql`true`);

  const wanted: Utterance[] = [];
  const unpinnable: string[] = [];
  for (const { zh, pinyin } of rows) {
    // Dropped rather than sent unpinned: an unpinned polyphone is the engine's
    // coin flip presented to a learner as fact.
    if (pinyin && toPhoneme(pinyin)) wanted.push({ hanzi: zh, pinyin });
    else unpinnable.push(zh);
  }
  return { wanted, unpinnable };
}

async function main() {
  const synth = synthesizerFromEnv();
  if (!synth) {
    console.error(
      "No Azure credentials. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION and re-run.\n" +
      "Nothing was changed — the app runs without audio, falling back to the browser voice.",
    );
    process.exit(1);
  }

  const voice = arg("voice") ?? synth.voice;
  const limit = Number(arg("limit") ?? 0) || Infinity;
  const force = has("force");

  const { wanted, unpinnable } = await corpus(has("chars-only"));
  if (unpinnable.length) {
    console.log(`· ${unpinnable.length} entries skipped: no reading we can pin`);
  }

  // Ask what's already there rather than assuming, so a re-run is cheap.
  const keys = wanted.map(w => ({ hanzi: w.hanzi, phoneme: toPhoneme(w.pinyin)! }));
  const existing = new Set<string>();
  if (!force) {
    for (let i = 0; i < keys.length; i += 500) {
      const slice = keys.slice(i, i + 500);
      const rows = await db.select({ hanzi: characterAudio.hanzi, phoneme: characterAudio.phoneme })
        .from(characterAudio)
        .where(and(
          inArray(characterAudio.hanzi, slice.map(k => k.hanzi)),
          eq(characterAudio.voice, voice),
        ));
      for (const r of rows) existing.add(`${r.hanzi}:${r.phoneme}`);
    }
  }

  const todo = wanted.filter((w, i) => !existing.has(`${w.hanzi}:${keys[i].phoneme}`)).slice(0, limit);
  console.log(`· ${wanted.length} readings in the dex, ${existing.size} already voiced by ${voice}`);
  console.log(`· synthesising ${todo.length}`);
  if (!todo.length) return;

  let done = 0, failed = 0;
  for (const utterance of todo) {
    try {
      const clip: Clip = await synth.speak(utterance);
      await db.insert(characterAudio)
        .values({
          hanzi: clip.hanzi, phoneme: clip.phoneme, pinyin: clip.pinyin,
          voice: clip.voice, mime: clip.mime, audio: clip.audio,
        })
        .onConflictDoUpdate({
          target: [characterAudio.hanzi, characterAudio.phoneme],
          set: { audio: clip.audio, voice: clip.voice, mime: clip.mime, pinyin: clip.pinyin },
        });
      done++;
      if (done % 100 === 0) console.log(`  … ${done}/${todo.length}`);
    } catch (err) {
      // One bad character must not cost the run. Report and carry on; the next
      // invocation retries only what is still missing.
      failed++;
      console.warn(`  ! ${utterance.hanzi} (${utterance.pinyin}): ${(err as Error).message}`);
      if (failed > 20 && failed > done) {
        console.error("Too many failures — stopping. Check the key, region and quota.");
        break;
      }
    }
  }

  console.log(`Voiced ${done}${failed ? `, ${failed} failed` : ""}. Re-run to fill any gap.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
