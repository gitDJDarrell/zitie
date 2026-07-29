import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { characterStrokes } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";

export const strokesRoute = new Hono();
strokesRoute.use("*", requireAuth);

/**
 * Stroke geometry for brush mode. Shared across users like insights — the
 * strokes of 思 are the same for everyone — so no per-user scoping.
 *
 * The cap is much lower than the insights route's 1000: each row carries the
 * SVG paths for every stroke and runs a couple of kilobytes, so a thousand of
 * them is megabytes over the wire. Brush mode only ever needs the character
 * currently on the card plus a small look-ahead, and the client caches what it
 * has already fetched.
 */
strokesRoute.post("/", async (c) => {
  const parsed = z.object({ hanzi: z.array(z.string()).max(24) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { hanzi: string[] } (max 24)." }, 400);
  if (!parsed.data.hanzi.length) return c.json({ strokes: {} });

  const rows = await db.select().from(characterStrokes)
    .where(inArray(characterStrokes.hanzi, parsed.data.hanzi));
  const strokes = Object.fromEntries(rows.map((r) => [r.hanzi, {
    strokes: r.strokes,
    medians: r.medians,
  }]));
  return c.json({ strokes });
});
