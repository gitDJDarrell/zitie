import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { cards, seenState, users } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { serializeSeen } from "../lib/seenWire.js";
import { DIR_OPPONENT, NEUTRAL_OPPONENT, nextRating } from "../lib/rating.js";
import { initialState, MASTERY_MARKS, schedule, type Grade } from "../lib/srs.js";

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

// Wire shape lives in lib/seenWire.ts — shared with GET /cards so the two
// can't disagree about which columns the client gets.
const serialize = serializeSeen;

const gradeSchema = z.object({
  id: z.string(),
  grade: z.enum(["again", "hard", "good", "easy"]),
  // Which direction the answer was produced in, sent only when the answer was
  // right. Three of these — one each way — is what earns a dex slot.
  proof: z.enum(["read", "write", "brush"]).optional(),
  // Set when this answer came from the 考 exam — the strict, unassisted second
  // pass a collected card sits to be mastered. A clean exam answer banks one
  // mark in its direction; MASTERY_MARKS of each is mastery. Marks only accrue
  // for already-collected cards, so the exam never runs ahead of collection.
  exam: z.boolean().optional(),
});

// POST /seen/grade — record a self-rating and reschedule the card.
// Unlike POST /seen (a raw view tally), this drives the SRS state machine.
seenRoute.post("/grade", async (c) => {
  const userId = c.get("userId");
  const parsed = gradeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Expected { id: string, grade: again|hard|good|easy, proof?: read|write|brush, exam?: boolean }." }, 400);
  }
  const { id, grade, proof, exam } = parsed.data;

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
    ...(earned === "brush" ? { brushOk: true } : {}),
  };

  // A mark is banked only when the strict exam answer was clean AND the card is
  // already fully collected. Proofs are set-once, so fold in whatever this turn
  // earned before deciding — a card can't clear the exam in the same breath it
  // finishes collecting. Capped at MASTERY_MARKS so a direction can't overrun.
  const proofState = {
    read: !!existing?.readOk || earned === "read",
    write: !!existing?.writeOk || earned === "write",
    brush: !!existing?.brushOk || earned === "brush",
  };
  const collected = proofState.read && proofState.write && proofState.brush;
  const markCol =
    exam && earned && collected
      ? ({ read: seenState.readMarks, write: seenState.writeMarks, brush: seenState.brushMarks } as const)[earned]
      : null;
  const markSet =
    markCol === seenState.readMarks ? { readMarks: sql`least(${seenState.readMarks} + 1, ${MASTERY_MARKS})` } :
    markCol === seenState.writeMarks ? { writeMarks: sql`least(${seenState.writeMarks} + 1, ${MASTERY_MARKS})` } :
    markCol === seenState.brushMarks ? { brushMarks: sql`least(${seenState.brushMarks} + 1, ${MASTERY_MARKS})` } :
    {};

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
        // Marks live only in the update path — a brand-new row is never
        // collected, so it can never bank one on first sight.
        ...markSet,
      },
    })
    .returning();

  // The 考 exam's Elo. Every exam trial is a match: a clean pass is a win, a
  // miss a loss, scored against the direction's opponent (or a neutral one when
  // a miss arrives without its direction, since `proof` only rides along on a
  // pass). This is the number the visible 科举 rank title sits on. Only exam
  // trials touch it — ordinary study never does.
  if (exam) {
    const [u] = await db.select({ rating: users.masteryRating }).from(users).where(eq(users.id, userId));
    if (u) {
      const opponent = earned ? DIR_OPPONENT[earned] : NEUTRAL_OPPONENT;
      const updated = nextRating(u.rating, opponent, grade !== "again");
      await db.update(users).set({ masteryRating: updated }).where(eq(users.id, userId));
    }
  }

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
