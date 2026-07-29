// Loads the shared reference data a release ships with: the HSK 3.0 word bank
// and the character breakdowns behind every dex slot. Public reference
// content, not user data, so it runs in every environment — `npm run
// db:deploy` calls it after migrating.
//
// Safe to re-run. Precedence, highest first:
//   1. hand-written breakdowns (data/insights-*.json other than the generated
//      one) — reviewed in-session, they always win
//   2. rows the runtime worker enriched (source "ai:…") — richer than the
//      generated pass, so a re-seed leaves them alone
//   3. the generated pass (source "seed:hsk-derived") — refreshed each run
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { characterInsights, characterStrokes, hskWords } from "../src/db/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const data = (name: string) => JSON.parse(readFileSync(join(here, "../data", name), "utf8"));

// Postgres caps a statement's parameters; these chunk sizes keep each insert
// comfortably under it while still making the 11k-row load a few round trips.
const WORD_CHUNK = 500;
const INSIGHT_CHUNK = 200;
// Stroke rows carry SVG paths and are an order of magnitude fatter than the
// rest, so they go in smaller batches to keep each statement modest.
const STROKE_CHUNK = 100;

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

interface SeedWord {
  zh: string; py: string | null; en: string | null;
  level: string; levels: string[]; pos: string[]; compound: boolean;
}

interface SeedInsight {
  hanzi: string;
  structure?: string | null;
  etyType?: string | null;
  components?: { char: string; reading?: string; gloss?: string; role: string; note?: string }[];
  story?: string | null;
  compounds?: { zh: string; py?: string; en?: string }[];
}

async function seedWords(): Promise<number> {
  const words = data("hsk-words.json") as SeedWord[];
  for (const batch of chunks(words, WORD_CHUNK)) {
    await db.insert(hskWords).values(batch.map((w) => ({
      zh: w.zh,
      pinyin: w.py,
      meaning: w.en,
      level: w.level,
      levels: w.levels,
      pos: w.pos,
      compound: w.compound,
    }))).onConflictDoUpdate({
      target: hskWords.zh,
      set: {
        pinyin: sql`excluded.pinyin`,
        meaning: sql`excluded.meaning`,
        level: sql`excluded.level`,
        levels: sql`excluded.levels`,
        pos: sql`excluded.pos`,
        compound: sql`excluded.compound`,
      },
    });
  }
  return words.length;
}

async function seedInsights(file: string, source: string, refreshOnly?: string): Promise<number> {
  const rows = (data(file) as SeedInsight[]).map((r) => ({
    hanzi: r.hanzi,
    structure: r.structure ?? null,
    etyType: r.etyType ?? null,
    components: (r.components ?? []) as never,
    story: r.story ?? null,
    compounds: (r.compounds ?? []) as never,
    source,
  }));

  for (const batch of chunks(rows, INSIGHT_CHUNK)) {
    await db.insert(characterInsights).values(batch).onConflictDoUpdate({
      target: characterInsights.hanzi,
      set: {
        structure: sql`excluded.structure`,
        etyType: sql`excluded.ety_type`,
        components: sql`excluded.components`,
        story: sql`excluded.story`,
        compounds: sql`excluded.compounds`,
        source: sql`excluded.source`,
      },
      // The generated pass only ever overwrites its own earlier output; a
      // hand-written or AI-enriched row survives a re-seed untouched.
      ...(refreshOnly ? { setWhere: sql`${characterInsights.source} = ${refreshOnly}` } : {}),
    });
  }
  return rows.length;
}

interface SeedStrokes { hanzi: string; strokes: string[]; medians: number[][][] }

/**
 * Stroke geometry for brush mode. Regenerated wholesale each run: it is derived
 * straight from makemeahanzi with no hand-editing anywhere in the chain, so
 * there is nothing here for a re-seed to trample.
 */
async function seedStrokes(): Promise<number> {
  const rows = (data("strokes-hsk.json") as SeedStrokes[]).map((r) => ({
    hanzi: r.hanzi,
    strokes: r.strokes as never,
    medians: r.medians as never,
  }));
  for (const batch of chunks(rows, STROKE_CHUNK)) {
    await db.insert(characterStrokes).values(batch).onConflictDoUpdate({
      target: characterStrokes.hanzi,
      set: { strokes: sql`excluded.strokes`, medians: sql`excluded.medians` },
    });
  }
  return rows.length;
}

async function main() {
  const words = await seedWords();
  console.log(`· ${words} HSK words upserted`);

  const derived = await seedInsights("insights-hsk.json", "seed:hsk-derived", "seed:hsk-derived");
  console.log(`· ${derived} generated character breakdowns upserted`);

  const curated = await seedInsights("insights-hsk1.json", "seed:hsk1");
  console.log(`· ${curated} hand-written breakdowns upserted (these win)`);

  // The characters the dataset records no etymology for, written by hand and
  // built by scripts/build-curated.ts. Same precedence as the HSK 1 set: they
  // were reviewed in-session, so they overwrite the generated fallback.
  const written = await seedInsights("insights-curated.json", "seed:written");
  console.log(`· ${written} hand-written breakdowns for characters the data has no account of`);

  const strokes = await seedStrokes();
  console.log(`· ${strokes} characters' stroke geometry upserted`);

  console.log("Reference data is loaded.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
