import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const settingsRoute = new Hono();
settingsRoute.use("*", requireAuth);

settingsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId));
  return c.json({ theme: row?.theme ?? "light", stack: row?.stack ?? [] });
});

// Partial update: either field may be sent alone (e.g. the theme toggle never
// touches the stack, and stack edits never touch the theme).
const patchSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  stack: z.array(z.string()).max(500, "A stack can hold at most 500 cards.").optional(),
}).refine((b) => b.theme !== undefined || b.stack !== undefined, { message: "Nothing to update." });

settingsRoute.patch("/", async (c) => {
  const userId = c.get("userId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);

  const [existing] = await db.select().from(settings).where(eq(settings.userId, userId));
  const next = {
    theme: parsed.data.theme ?? existing?.theme ?? "light",
    stack: parsed.data.stack ?? existing?.stack ?? [],
  };
  await db.insert(settings).values({ userId, ...next })
    .onConflictDoUpdate({ target: settings.userId, set: next });
  return c.json(next);
});
