import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { cards } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const exportRoute = new Hono();
exportRoute.use("*", requireAuth);

// GET /export — same shape as the client's "copy bank" export: id/added stripped.
exportRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db.select().from(cards).where(eq(cards.userId, userId));
  const out = rows.map(({ id, userId: _u, added, ...rest }) => rest);
  return c.json(out);
});
