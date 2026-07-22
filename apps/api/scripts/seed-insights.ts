// Loads the in-session-generated, grounded character insights into the shared
// character_insights table. Safe to re-run: upserts by hanzi. Runs in any
// environment (the data is public reference content, not user data).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db } from "../src/db/client.js";
import { characterInsights } from "../src/db/schema.js";

const here = dirname(fileURLToPath(import.meta.url));

interface SeedInsight {
  hanzi: string;
  structure?: string;
  etyType?: string;
  components?: { char: string; reading?: string; gloss?: string; role: string; note?: string }[];
  story?: string;
  compounds?: { zh: string; py?: string; en?: string }[];
}

async function main() {
  const files = ["../data/insights-hsk1.json"];
  let total = 0;
  for (const rel of files) {
    const path = join(here, rel);
    const rows = JSON.parse(readFileSync(path, "utf8")) as SeedInsight[];
    const source = `seed:${rel.match(/insights-(\w+)\.json/)?.[1] ?? "hsk"}`;
    for (const r of rows) {
      await db.insert(characterInsights).values({
        hanzi: r.hanzi,
        structure: r.structure ?? null,
        etyType: r.etyType ?? null,
        components: (r.components ?? []) as any,
        story: r.story ?? null,
        compounds: (r.compounds ?? []) as any,
        source,
      }).onConflictDoUpdate({
        target: characterInsights.hanzi,
        set: {
          structure: r.structure ?? null,
          etyType: r.etyType ?? null,
          components: (r.components ?? []) as any,
          story: r.story ?? null,
          compounds: (r.compounds ?? []) as any,
          source,
        },
      });
      total++;
    }
    console.log(`Loaded ${rows.length} insight(s) from ${rel}`);
  }
  console.log(`Done — ${total} character insight(s) upserted.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
