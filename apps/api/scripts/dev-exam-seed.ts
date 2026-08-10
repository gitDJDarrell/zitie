// Dev-only shortcut to reach the 考 exam without grinding a collection first.
// Marks a handful of the dev account's cards as collected-and-due so they show
// up in the exam, and puts one card a single mark from mastery so the 精通
// banner is one pass away. Refuses to run in production. Safe to re-run.
//
//   cd apps/api && npx tsx scripts/dev-exam-seed.ts
import "dotenv/config";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { cards, seenState, users } from "../src/db/schema.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to touch seen-state in production.");
  process.exit(1);
}

const EMAIL = process.env.SEED_USER_EMAIL ?? "dev@zitie.local";
const HOW_MANY = 6; // how many single-character cards to make exam-ready

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (!user) {
    console.error(`No user ${EMAIL}. Run "npm run db:seed" first.`);
    process.exit(1);
  }

  // Prefer cards that have no seen-state yet, so re-running doesn't disturb
  // real progress. Single characters only — the brush trial wants stroke data.
  const fresh = await db
    .select({ id: cards.id, hanzi: cards.hanzi })
    .from(cards)
    .leftJoin(seenState, eq(seenState.cardId, cards.id))
    .where(and(eq(cards.userId, user.id), isNull(seenState.cardId), sql`char_length(${cards.hanzi}) = 1`))
    .orderBy(cards.hanzi)
    .limit(HOW_MANY);

  if (!fresh.length) {
    console.log("No un-studied single-character cards left to seed. Nothing to do.");
    process.exit(0);
  }

  const now = new Date();
  const due = new Date(now.getTime() - 24 * 60 * 60 * 1000); // due yesterday
  for (const [i, card] of fresh.entries()) {
    // The first card sits one write-mark from mastery; the rest start clean.
    const nearMastery = i === 0;
    await db.insert(seenState).values({
      cardId: card.id, userId: user.id,
      last: now, views: 5, ease: 2.5, intervalDays: 3, due,
      reps: 3, lapses: 0, lastGrade: "good",
      readOk: true, writeOk: true, brushOk: true,
      readMarks: nearMastery ? 3 : 0,
      writeMarks: nearMastery ? 2 : 0,
      brushMarks: nearMastery ? 3 : 0,
    }).onConflictDoUpdate({
      target: seenState.cardId,
      set: {
        due, readOk: true, writeOk: true, brushOk: true,
        readMarks: nearMastery ? 3 : 0,
        writeMarks: nearMastery ? 2 : 0,
        brushMarks: nearMastery ? 3 : 0,
      },
    });
    console.log(`  ${card.hanzi} — collected + due${nearMastery ? " · one write-pass from 精通 mastery" : ""}`);
  }

  console.log(`\nSeeded ${fresh.length} exam-ready card(s). Open 鉴 Gallery → 考 sit the exam.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
