import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, seenState } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { serializeSeen, type SeenWire } from "../lib/seenWire.js";

export const cardsRoute = new Hono();
cardsRoute.use("*", requireAuth);

// GET /cards — full bank load: cards + seen map, mirrors the client's single loadData shape.
cardsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const [rows, seenRows] = await Promise.all([
    db.select().from(cards).where(eq(cards.userId, userId)),
    db.select().from(seenState).where(eq(seenState.userId, userId)),
  ]);

  const seen: Record<string, SeenWire> = {};
  for (const r of seenRows) seen[r.cardId] = serializeSeen(r);

  return c.json({ cards: rows, seen });
});

// Bulk import used to live here. It is gone deliberately: packs are the only
// way a card enters a collection, and an endpoint that inserts arbitrary
// cards would bypass the entire economy — pity timers, tier bands, rarity and
// all. Cards are dealt by POST /packs/open and nowhere else.

const patchSchema = z.object({
  starred: z.boolean().optional(),
  pinyin: z.string().optional(),
  meaning: z.string().optional(),
  pos: z.array(z.string()).optional(),
  compound: z.boolean().optional(),
  radical: z.string().nullable().optional(),
  strokes: z.number().nullable().optional(),
  examples: z.array(z.object({ zh: z.string(), py: z.string().optional(), en: z.string().optional() })).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /cards/:id — partial update (used for star toggle, manual edits).
cardsRoute.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid input." }, 400);

  const [row] = await db.update(cards).set(parsed.data)
    .where(and(eq(cards.id, id), eq(cards.userId, userId)))
    .returning();
  if (!row) return c.json({ error: "Card not found." }, 404);
  return c.json(row);
});

const idsSchema = z.object({ ids: z.array(z.string()).min(1) });

// DELETE /cards — bulk delete by id.
cardsRoute.delete("/", async (c) => {
  const userId = c.get("userId");
  const parsed = idsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { ids: string[] }." }, 400);

  await db.delete(cards).where(and(eq(cards.userId, userId), inArray(cards.id, parsed.data.ids)));
  return c.json({ ok: true });
});

// POST /cards/clear-all — wipe the whole bank (two-tap confirm lives client-side).
cardsRoute.post("/clear-all", async (c) => {
  const userId = c.get("userId");
  await db.delete(cards).where(eq(cards.userId, userId));
  return c.json({ ok: true });
});
