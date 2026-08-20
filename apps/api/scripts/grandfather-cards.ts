// One-off: back-fill rarity and source for cards that predate the pack system.
//
// Everything already in a collection arrived by import, before packs existed.
// The rarity columns were added with defaults ('common' / 'pack'), which is
// wrong on both counts: the grade should be the one the rating formula gives
// the character, and the source should say these were grandfathered rather
// than dealt. SRS history is untouched — nobody loses proven work.
//
// Idempotent: re-running only ever rewrites the same values.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { cards, hskWords } from "../src/db/schema.js";
import { initRatings, rarityOf } from "../src/lib/rating.js";

async function main() {
  const words = await db.select({ zh: hskWords.zh }).from(hskWords);
  if (!words.length) {
    throw new Error("hsk_words is empty — run db:seed-reference first, or rarities would all be wrong.");
  }
  initRatings(words.map(w => w.zh));
  console.log(`indexed ${words.length} HSK words`);

  // Cards dealt by a pack already carry the right values and are left alone.
  //
  // --all overrides that and rewrites every row. Needed exactly once, for
  // collections that predate migration 0011: those rows took the original
  // source default of "pack" despite never having been dealt, so they are
  // indistinguishable from real pulls by column alone. Safe only while no
  // pack has been opened yet — check the wallet table before reaching for it.
  const all = process.argv.includes("--all");
  const rows = await db.select().from(cards);
  const stale = all ? rows : rows.filter(r => r.source !== "pack");
  console.log(`${rows.length} cards, ${stale.length} to grandfather${all ? " (--all)" : ""}`);

  const tally: Record<string, number> = {};
  let changed = 0;
  for (const row of stale) {
    const rarity = rarityOf(row.hanzi);
    if (row.rarity === rarity && row.source === "grandfathered") continue;
    await db.update(cards)
      .set({ rarity, source: "grandfathered" })
      .where(eq(cards.id, row.id));
    tally[rarity] = (tally[rarity] ?? 0) + 1;
    changed++;
  }

  console.log(`grandfathered ${changed} cards`);
  for (const [rarity, n] of Object.entries(tally).sort()) console.log(`  ${rarity.padEnd(10)} ${n}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
