import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { characterInsights } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { isEnrichmentConfigured, requestEnrichment } from "../lib/enrich.js";
import { rateLimit } from "../lib/rateLimit.js";

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

// Ask for a never-seeded character to be enriched in the background. Returns
// immediately — the client keeps polling the bulk fetch above until the row
// lands, or gives up if we say the character is unavailable. Each accepted
// character costs one model call, once, for every user who ever sees it, so
// the ceiling here is deliberately low.
insightsRoute.use("/enrich", rateLimit({ windowMs: 60 * 60 * 1000, max: 60 }));
insightsRoute.post("/enrich", async (c) => {
  const parsed = z.object({ hanzi: z.array(z.string()).max(8) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { hanzi: string[] }." }, 400);
  if (!isEnrichmentConfigured()) {
    return c.json({ queued: [], unavailable: parsed.data.hanzi }, 200);
  }

  // Skip anything already cached — the request is racing the client's own
  // fetch, and re-enriching a seeded character would overwrite reviewed work.
  const cached = parsed.data.hanzi.length
    ? await db.select({ hanzi: characterInsights.hanzi }).from(characterInsights)
        .where(inArray(characterInsights.hanzi, parsed.data.hanzi))
    : [];
  const have = new Set(cached.map((r) => r.hanzi));

  return c.json(requestEnrichment(parsed.data.hanzi.filter((h) => !have.has(h))));
});
