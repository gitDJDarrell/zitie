import { and, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { characterAudio } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { toPhoneme } from "../lib/pinyin.js";

export const audioRoute = new Hono();
audioRoute.use("*", requireAuth);

/**
 * Pronunciation clips. Shared reference data like strokes and insights — 茶
 * sounds the same for everyone — so no per-user scoping.
 *
 * Asked for by reading, not just by character. 行 has two clips and they are
 * different sounds; answering with whichever row happened to come back first
 * would teach the wrong one half the time, which is the entire reason this
 * feature stores a phoneme in its key.
 *
 * A miss is normal and not an error: the character may simply not be seeded
 * yet, and the client falls back to the browser's own voice. The cap is low
 * for the same reason as strokes — each row is a few KB of base64.
 */
const askSchema = z.object({
  want: z.array(z.object({ hanzi: z.string().min(1), pinyin: z.string() })).max(24),
});

audioRoute.post("/", async (c) => {
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Expected { want: {hanzi, pinyin}[] } (max 24)." }, 400);
  }
  if (!parsed.data.want.length) return c.json({ clips: {} });

  // Normalise the asked-for reading the same way the seeder did, so "xíng",
  // "xing2" and a stray capital all find the one row.
  const keys = parsed.data.want
    .map(w => ({ hanzi: w.hanzi, phoneme: toPhoneme(w.pinyin) }))
    .filter((k): k is { hanzi: string; phoneme: string } => !!k.phoneme);
  if (!keys.length) return c.json({ clips: {} });

  const rows = await db.select().from(characterAudio).where(
    or(...keys.map(k => and(
      eq(characterAudio.hanzi, k.hanzi),
      eq(characterAudio.phoneme, k.phoneme),
    ))),
  );

  // Keyed by hanzi+phoneme so the client can tell the two readings apart.
  const clips = Object.fromEntries(rows.map(r => [`${r.hanzi}:${r.phoneme}`, {
    mime: r.mime, audio: r.audio, voice: r.voice, pinyin: r.pinyin,
  }]));
  return c.json({ clips });
});

/** Which characters have any clip at all — lets the UI stop offering dead buttons. */
audioRoute.post("/have", async (c) => {
  const parsed = z.object({ hanzi: z.array(z.string()).max(500) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { hanzi: string[] } (max 500)." }, 400);
  if (!parsed.data.hanzi.length) return c.json({ have: [] });

  const rows = await db.selectDistinct({ hanzi: characterAudio.hanzi })
    .from(characterAudio)
    .where(inArray(characterAudio.hanzi, parsed.data.hanzi));
  return c.json({ have: rows.map(r => r.hanzi) });
});
