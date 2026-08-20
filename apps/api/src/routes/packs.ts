import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, wallet } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { lookupHanzi } from "../lib/hanzi.js";
import {
  LEVEL_CHARS, LEVEL_IDS, PACK_COST, RARITY_ORDER, TIER_GRANT,
  ratingsReady, rollPack, type Rarity,
} from "../lib/rating.js";
import { lookupReference } from "../lib/reference.js";

export const packsRoute = new Hono();
packsRoute.use("*", requireAuth);

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface WalletState {
  points: number;
  tier: number;
  packs: Record<string, number>;
  sinceEpic: number;
  sinceLegendary: number;
  tierBand: string;
  periodStart: Date;
}

const BLANK: WalletState = {
  points: 0, tier: 1, packs: {}, sinceEpic: 0, sinceLegendary: 0,
  tierBand: "1", periodStart: new Date(0),
};

/** Load the wallet, applying the monthly grant if a new calendar month has
    started. Granted lazily rather than by a cron, and capped at one month's
    worth however long the user has been away — a returning learner gets a
    fresh month, not a backlog of twelve. */
async function loadWallet(userId: string): Promise<WalletState> {
  const [row] = await db.select().from(wallet).where(eq(wallet.userId, userId));
  const state: WalletState = row
    ? {
        points: row.points, tier: row.tier, packs: row.packs ?? {},
        sinceEpic: row.sinceEpic, sinceLegendary: row.sinceLegendary,
        tierBand: row.tierBand, periodStart: row.periodStart,
      }
    : { ...BLANK, packs: {} };

  const now = new Date();
  const period = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  if (!row || period(now) > period(state.periodStart)) {
    const grant = TIER_GRANT[state.tier] ?? TIER_GRANT[1];
    state.packs = { ...state.packs, common: (state.packs.common ?? 0) + grant };
    state.periodStart = now;
    await saveWallet(userId, state);
  }
  return state;
}

/** Advance the draw band once the current tier is mostly collected. Without
    this a learner draws from HSK 1 forever; with it the band walks up as they
    fill each level, and the 80/20 split keeps giving a taste of the next. */
const BAND_ADVANCE_AT = 0.6;

async function advanceBand(userId: string, s: WalletState): Promise<boolean> {
  const level = LEVEL_CHARS[s.tierBand];
  if (!level) return false;
  const next = LEVEL_IDS[LEVEL_IDS.indexOf(s.tierBand) + 1];
  if (!next) return false;

  const owned = await db.select({ hanzi: cards.hanzi }).from(cards).where(eq(cards.userId, userId));
  const have = new Set(owned.map(r => r.hanzi));
  let held = 0;
  for (const ch of level) if (have.has(ch)) held++;
  if (held / level.length < BAND_ADVANCE_AT) return false;

  s.tierBand = next;
  return true;
}

async function saveWallet(userId: string, s: WalletState): Promise<void> {
  const values = {
    points: s.points, tier: s.tier, packs: s.packs,
    sinceEpic: s.sinceEpic, sinceLegendary: s.sinceLegendary,
    tierBand: s.tierBand, periodStart: s.periodStart,
  };
  await db.insert(wallet).values({ userId, ...values })
    .onConflictDoUpdate({ target: wallet.userId, set: values });
}

function wire(s: WalletState) {
  return {
    points: s.points, tier: s.tier, packs: s.packs,
    sinceEpic: s.sinceEpic, sinceLegendary: s.sinceLegendary,
    tierBand: s.tierBand,
    grant: TIER_GRANT[s.tier] ?? TIER_GRANT[1],
  };
}

packsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  return c.json(wire(await loadWallet(userId)));
});

const openSchema = z.object({
  grade: z.enum(["common", "rare", "epic", "legendary"]).default("common"),
});

// POST /packs/open — spend one pack of the given grade and deal 16 cards.
// The roll happens here and nowhere else: a client that rolls its own
// legendaries is not playing a game.
packsRoute.post("/open", async (c) => {
  const userId = c.get("userId");
  if (!ratingsReady()) return c.json({ error: "Ratings are still loading. Try again in a moment." }, 503);

  const parsed = openSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Unknown pack grade." }, 400);
  const grade = parsed.data.grade as Rarity;

  const state = await loadWallet(userId);
  if ((state.packs[grade] ?? 0) < 1) {
    return c.json({ error: `You have no ${grade} packs to open.` }, 400);
  }

  const owned = await db.select({ hanzi: cards.hanzi }).from(cards).where(eq(cards.userId, userId));
  const ownedSet = new Set(owned.map(r => r.hanzi));

  const roll = rollPack({
    grade, tier: state.tierBand, owned: ownedSet,
    sinceEpic: state.sinceEpic, sinceLegendary: state.sinceLegendary,
  });
  if (!roll.cards.length) {
    return c.json({ error: "Nothing left to collect at this tier." }, 400);
  }

  // Readings and glosses come from the HSK standard where it has them, and
  // from the local character data otherwise — a dex character that is not a
  // standalone HSK word still has a reading.
  const reference = await lookupReference(roll.cards.map(r => r.hanzi));
  const made: typeof cards.$inferSelect[] = [];
  for (const rating of roll.cards) {
    const ref = reference.get(rating.hanzi);
    const facts = ref?.pinyin && ref?.meaning ? null : lookupHanzi(rating.hanzi);
    const row = {
      id: nanoid(),
      userId,
      hanzi: rating.hanzi,
      pinyin: ref?.pinyin ?? facts?.readings?.[0] ?? "",
      meaning: ref?.meaning ?? facts?.gloss ?? "",
      pos: ref?.pos ?? [],
      compound: ref?.compound ?? false,
      radical: facts?.radical ?? null,
      strokes: facts?.strokes ?? null,
      examples: null,
      notes: null,
      starred: false,
      added: today(),
      rarity: rating.rarity,
      source: "pack",
    };
    await db.insert(cards).values(row).onConflictDoNothing();
    made.push(row as typeof cards.$inferSelect);
  }

  state.packs = { ...state.packs, [grade]: (state.packs[grade] ?? 0) - 1 };
  state.sinceEpic = roll.sinceEpic;
  state.sinceLegendary = roll.sinceLegendary;
  // Opening a pack is the only thing that grows the collection, so it is the
  // only moment the band can have filled.
  await advanceBand(userId, state);
  await saveWallet(userId, state);

  return c.json({ cards: made, wallet: wire(state) });
});

const buySchema = z.object({
  grade: z.enum(["common", "rare", "epic", "legendary"]),
});

// POST /packs/buy — spend points earned by studying. The only route to more
// packs that does not run through the subscription.
packsRoute.post("/buy", async (c) => {
  const userId = c.get("userId");
  const parsed = buySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Unknown pack grade." }, 400);
  const grade = parsed.data.grade as Rarity;

  const state = await loadWallet(userId);
  const cost = PACK_COST[grade];
  if (state.points < cost) {
    return c.json({ error: `A ${grade} pack costs ${cost} points. You have ${state.points}.` }, 400);
  }

  state.points -= cost;
  state.packs = { ...state.packs, [grade]: (state.packs[grade] ?? 0) + 1 };
  await saveWallet(userId, state);
  return c.json(wire(state));
});

const tierSchema = z.object({ tier: z.number().int().min(1).max(3) });

packsRoute.patch("/tier", async (c) => {
  const userId = c.get("userId");
  const parsed = tierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Tier must be 1, 2 or 3." }, 400);

  const state = await loadWallet(userId);
  state.tier = parsed.data.tier;
  await saveWallet(userId, state);
  return c.json(wire(state));
});

/** Award points for study. Called by the grade route, never by the client —
    points have to be minted where the proof is verified. */
export async function awardPoints(userId: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const state = await loadWallet(userId);
  state.points += amount;
  await saveWallet(userId, state);
  return state.points;
}

export { RARITY_ORDER };
