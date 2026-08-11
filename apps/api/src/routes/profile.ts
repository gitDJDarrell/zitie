import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { RATING_BASE } from "../lib/rating.js";

export const profileRoute = new Hono();
profileRoute.use("*", requireAuth);

/** The wire shape — timestamps flattened to epoch millis, secrets omitted. */
function serialize(row: typeof users.$inferSelect) {
  return {
    username: row.username,
    email: row.email,
    phone: row.phone,
    bio: row.bio,
    avatar: row.avatar,
    joinedAt: row.createdAt.getTime(),
    lastSeen: row.lastSeen ? row.lastSeen.getTime() : null,
    masteryRating: row.masteryRating ?? RATING_BASE,
  };
}

export type ProfileWire = ReturnType<typeof serialize>;

profileRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return c.json({ error: "Not found." }, 404);
  return c.json(serialize(row));
});

// Everything an account holder can set about themselves. Each field may be sent
// alone; an empty string clears the field (stored as NULL) rather than saving a
// blank. Email is deliberately not here — it's the login identity, changed
// through its own flow, not a casual profile edit.
const patchSchema = z.object({
  username: z.string().trim().max(24, "Username can be at most 24 characters.")
    .regex(/^[a-zA-Z0-9_]*$/, "Username can use only letters, numbers, and underscores.")
    .refine((v) => v === "" || v.length >= 3, "Username must be at least 3 characters.")
    .optional(),
  phone: z.string().trim().max(32, "That phone number is too long.")
    .regex(/^[0-9+()\-.\s]*$/, "A phone number can hold only digits and + ( ) - . spaces.")
    .optional(),
  bio: z.string().max(280, "A bio can be at most 280 characters.").optional(),
  // A small, client-resized image inlined as a data: URI. Capped so a user row
  // stays a row; the client downscales to ~256px, which lands far under this.
  avatar: z.string().max(700_000, "That image is too large — pick a smaller one.")
    .refine((v) => v === "" || v.startsWith("data:image/"), "Avatar must be an image.")
    .optional(),
}).refine((b) => Object.keys(b).length > 0, { message: "Nothing to update." });

// "" clears a field; a real value is trimmed already by the schema.
const orNull = (v: string | undefined) => (v === undefined ? undefined : v === "" ? null : v);

profileRoute.patch("/", async (c) => {
  const userId = c.get("userId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);

  const set: Partial<typeof users.$inferInsert> = {};
  if ("username" in parsed.data) set.username = orNull(parsed.data.username);
  if ("phone" in parsed.data) set.phone = orNull(parsed.data.phone);
  if ("bio" in parsed.data) set.bio = orNull(parsed.data.bio);
  if ("avatar" in parsed.data) set.avatar = orNull(parsed.data.avatar);

  try {
    const [row] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    if (!row) return c.json({ error: "Not found." }, 404);
    return c.json(serialize(row));
  } catch (err) {
    // The one expected failure: the username unique index. Everything else is a
    // real server error and should surface as one.
    const msg = String((err as { message?: string })?.message ?? err);
    if (/users_username_idx|unique/i.test(msg)) {
      return c.json({ error: "That username is already taken." }, 409);
    }
    throw err;
  }
});
