// Loads seed-dev.json into a dev account. Refuses to run in production.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../src/db/client.js";
import { cards, users } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/auth.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const DEV_EMAIL = process.env.SEED_USER_EMAIL ?? "dev@zitie.local";
const DEV_PASSWORD = process.env.SEED_USER_PASSWORD ?? "dev-password-change-me";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(__dirname, "../../../seed-dev.json");

async function main() {
  const raw = readFileSync(seedPath, "utf8");
  const items: any[] = JSON.parse(raw);

  let [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL));
  if (!user) {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    [user] = await db.insert(users).values({ email: DEV_EMAIL, passwordHash }).returning();
    console.log(`Created dev user ${DEV_EMAIL} (password: ${DEV_PASSWORD})`);
  } else {
    console.log(`Using existing dev user ${DEV_EMAIL}`);
  }

  const existing = await db.select({ hanzi: cards.hanzi }).from(cards).where(eq(cards.userId, user.id));
  const have = new Set(existing.map((c) => c.hanzi));

  const today = new Date().toISOString().slice(0, 10);
  const toInsert = items
    .filter((item) => !have.has(item.hanzi))
    .map((item) => ({
      id: nanoid(),
      userId: user.id,
      hanzi: String(item.hanzi),
      pinyin: String(item.pinyin),
      meaning: String(item.meaning),
      pos: Array.isArray(item.pos) ? item.pos.map(String) : [],
      compound: !!item.compound,
      radical: item.radical ? String(item.radical) : null,
      strokes: Number.isFinite(Number(item.strokes)) ? Number(item.strokes) : null,
      examples: Array.isArray(item.examples) ? item.examples : null,
      notes: item.notes ? String(item.notes) : null,
      added: today,
    }));

  if (toInsert.length) {
    await db.insert(cards).values(toInsert);
  }

  console.log(`Seeded ${toInsert.length} new card(s), skipped ${items.length - toInsert.length} already present.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
