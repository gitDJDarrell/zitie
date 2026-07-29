import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, seenState } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { initialState, schedule, type Grade } from "../lib/srs.js";

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

  return c.json(serialize(row));
});

// The wire shape of a seen_state row — timestamps flattened to epoch millis.
function serialize(row: typeof seenState.$inferSelect) {
  return {
    last: row.last.getTime(),
    views: row.views,
    ease: row.ease,
    intervalDays: row.intervalDays,
    due: row.due ? row.due.getTime() : null,
    reps: row.reps,
    lapses: row.lapses,
    lastGrade: row.lastGrade,
    readOk: row.readOk,
    writeOk: row.writeOk,
  };
}

const gradeSchema = z.object({
  id: z.string(),
  grade: z.enum(["again", "hard", "good", "easy"]),
  // Which direction the answer was produced in, sent only when the answer was
  // right. Two of these — one each way — is what earns a dex slot.
  proof: z.enum(["read", "write"]).optional(),
});

// POST /seen/grade — record a self-rating and reschedule the card.
// Unlike POST /seen (a raw view tally), this drives the SRS state machine.
seenRoute.post("/grade", async (c) => {
  const userId = c.get("userId");
  const parsed = gradeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Expected { id: string, grade: again|hard|good|easy, proof?: read|write }." }, 400);
  }
  const { id, grade, proof } = parsed.data;

  const [card] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
  if (!card) return c.json({ error: "Card not found." }, 404);

  const [existing] = await db.select().from(seenState).where(eq(seenState.cardId, id));
  const prev = existing
    ? { ease: existing.ease, intervalDays: existing.intervalDays, due: existing.due, reps: existing.reps, lapses: existing.lapses }
    : initialState();

  const now = new Date();
  const next = schedule(prev, grade as Grade, now);

  // A proof only counts when the answer was right — a card you graded "again"
  // proves the opposite. Flags are raised, never lowered: forgetting a
  // character later costs you the schedule, not the slot you earned.
  const earned = proof && grade !== "again" ? proof : null;
  const proofSet = {
    ...(earned === "read" ? { readOk: true } : {}),
    ...(earned === "write" ? { writeOk: true } : {}),
  };

  const [row] = await db.insert(seenState)
    .values({
      cardId: id, userId, last: now, views: 1,
      ease: next.ease, intervalDays: next.intervalDays, due: next.due,
      reps: next.reps, lapses: next.lapses, lastGrade: grade,
      ...proofSet,
    })
    .onConflictDoUpdate({
      target: seenState.cardId,
      set: {
        last: now, views: sql`${seenState.views} + 1`,
        ease: next.ease, intervalDays: next.intervalDays, due: next.due,
        reps: next.reps, lapses: next.lapses, lastGrade: grade,
        ...proofSet,
      },
    })
    .returning();

  return c.json(serialize(row));
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
