import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, seenState } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const seenRoute = new Hono();
seenRoute.use("*", requireAuth);

const seenSchema = z.object({ id: z.string() });

// POST /seen — mark a card viewed: increments views, bumps last-seen timestamp.
seenRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const parsed = seenSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { id: string }." }, 400);
  const { id } = parsed.data;

  const [card] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
  if (!card) return c.json({ error: "Card not found." }, 404);

  const now = new Date();
  const [row] = await db.insert(seenState).values({ cardId: id, userId, last: now, views: 1 })
    .onConflictDoUpdate({
      target: seenState.cardId,
      set: { last: now, views: sql`${seenState.views} + 1` },
    })
    .returning();

  return c.json({ last: row.last.getTime(), views: row.views });
});

const resetSchema = z.object({ ids: z.array(z.string()).optional() });

// POST /seen/reset — clear seen-state, either globally or for a set of ids.
seenRoute.post("/reset", async (c) => {
  const userId = c.get("userId");
  const parsed = resetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid input." }, 400);

  if (parsed.data.ids?.length) {
    await db.delete(seenState).where(and(eq(seenState.userId, userId), inArray(seenState.cardId, parsed.data.ids)));
  } else {
    await db.delete(seenState).where(eq(seenState.userId, userId));
  }
  return c.json({ ok: true });
});
