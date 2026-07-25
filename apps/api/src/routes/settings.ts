import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const settingsRoute = new Hono();
settingsRoute.use("*", requireAuth);

const DEFAULTS = { theme: "light", stack: [] as string[], autoSpeak: true, difficulty: 2 };

settingsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId));
  return c.json({
    theme: row?.theme ?? DEFAULTS.theme,
    stack: row?.stack ?? DEFAULTS.stack,
    autoSpeak: row?.autoSpeak ?? DEFAULTS.autoSpeak,
    difficulty: row?.difficulty ?? DEFAULTS.difficulty,
  });
});

// Partial update: any field may be sent alone (e.g. the theme toggle never
// touches the stack, and stack edits never touch the theme).
const patchSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  stack: z.array(z.string()).max(500, "A stack can hold at most 500 cards.").optional(),
  autoSpeak: z.boolean().optional(),
  difficulty: z.number().int().min(0).max(4).optional(),
}).refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Nothing to update." });

settingsRoute.patch("/", async (c) => {
  const userId = c.get("userId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);

  const [existing] = await db.select().from(settings).where(eq(settings.userId, userId));
  const next = {
    theme: parsed.data.theme ?? existing?.theme ?? DEFAULTS.theme,
    stack: parsed.data.stack ?? existing?.stack ?? DEFAULTS.stack,
    autoSpeak: parsed.data.autoSpeak ?? existing?.autoSpeak ?? DEFAULTS.autoSpeak,
    difficulty: parsed.data.difficulty ?? existing?.difficulty ?? DEFAULTS.difficulty,
  };
  await db.insert(settings).values({ userId, ...next })
    .onConflictDoUpdate({ target: settings.userId, set: next });
  return c.json(next);
});
