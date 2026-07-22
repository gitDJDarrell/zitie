import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { characterInsights } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const insightsRoute = new Hono();
insightsRoute.use("*", requireAuth);

// Bulk fetch: the client asks for insights for the hanzi it's about to show.
// Insights are shared across users, so there's no per-user scoping here.
insightsRoute.post("/", async (c) => {
  const parsed = z.object({ hanzi: z.array(z.string()).max(1000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { hanzi: string[] }." }, 400);
  if (!parsed.data.hanzi.length) return c.json({ insights: {} });

  const rows = await db.select().from(characterInsights)
    .where(inArray(characterInsights.hanzi, parsed.data.hanzi));
  const insights = Object.fromEntries(rows.map(r => [r.hanzi, {
    structure: r.structure, etyType: r.etyType, components: r.components,
    story: r.story, compounds: r.compounds,
  }]));
  return c.json({ insights });
});
