import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, seenState } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { mergeCard, normalizeItem } from "../lib/merge.js";

export const cardsRoute = new Hono();
cardsRoute.use("*", requireAuth);

function today() {
  return new Date().toISOString().slice(0, 10);
}

// GET /cards — full bank load: cards + seen map, mirrors the client's single loadData shape.
cardsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const [rows, seenRows] = await Promise.all([
    db.select().from(cards).where(eq(cards.userId, userId)),
    db.select().from(seenState).where(eq(seenState.userId, userId)),
  ]);

  const seen: Record<string, unknown> = {};
  for (const r of seenRows) {
    seen[r.cardId] = {
      last: r.last.getTime(), views: r.views,
      ease: r.ease, intervalDays: r.intervalDays,
      due: r.due ? r.due.getTime() : null,
      reps: r.reps, lapses: r.lapses,
    };
  }

  return c.json({ cards: rows, seen });
});

// POST /cards — bulk upsert with the additive merge, keyed by hanzi.
cardsRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  if (!Array.isArray(body)) {
    return c.json({ error: "Expected a JSON array." }, 400);
  }

  const existing = await db.select().from(cards).where(eq(cards.userId, userId));
  const byHanzi = new Map(existing.map((c) => [c.hanzi, c]));

  let added = 0, updated = 0;
  try {
    for (const [i, item] of body.entries()) {
      const norm = normalizeItem(item, i);
      const prev = byHanzi.get(norm.hanzi);
      if (prev) {
        const merged = mergeCard(prev, norm);
        await db.update(cards).set(merged).where(eq(cards.id, prev.id));
        updated++;
      } else {
        const id = nanoid();
        await db.insert(cards).values({
          id, userId, hanzi: norm.hanzi, pinyin: norm.pinyin, meaning: norm.meaning,
          pos: norm.pos ?? [], compound: norm.compound ?? false,
          radical: norm.radical, strokes: norm.strokes,
          examples: norm.examples, notes: norm.notes,
          added: today(),
        });
        added++;
      }
    }
  } catch (err: any) {
    return c.json({ error: err.message ?? "Import failed." }, 400);
  }

  const rows = await db.select().from(cards).where(eq(cards.userId, userId));
  return c.json({ cards: rows, added, updated });
});

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
