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
  return c.json({ theme: row?.theme ?? "light" });
});

const patchSchema = z.object({ theme: z.enum(["light", "dark"]) });

settingsRoute.patch("/", async (c) => {
  const userId = c.get("userId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "theme must be 'light' or 'dark'." }, 400);

  await db.insert(settings).values({ userId, theme: parsed.data.theme })
    .onConflictDoUpdate({ target: settings.userId, set: { theme: parsed.data.theme } });
  return c.json({ theme: parsed.data.theme });
});
