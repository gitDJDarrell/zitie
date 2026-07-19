import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";

export const aiRoute = new Hono();

aiRoute.use("*", requireAuth);
// Each call costs real model tokens — keep a per-IP ceiling well above normal
// study-session usage but low enough to cap abuse.
aiRoute.use("*", rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }));

const requestSchema = z.object({
  text: z.string().max(20_000).optional(),
  image: z.object({
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    data: z.string().max(2_500_000), // base64; global body limit is 2 MB anyway
  }).optional(),
}).refine((b) => (b.text ?? "").trim().length > 0 || b.image, {
  message: "Provide text or an image.",
});

// Mirrors the import schema the bank accepts (see ImportView / merge.ts).
// Structured outputs guarantee the response parses and validates against this.
const outputFormat = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["hanzi", "pinyin", "meaning", "pos", "compound", "examples"],
          properties: {
            hanzi: { type: "string" },
            pinyin: { type: "string" },
            meaning: { type: "string" },
            pos: { type: "array", items: { type: "string" } },
            compound: { type: "boolean" },
            radical: { type: "string" },
            strokes: { type: "integer" },
            examples: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["zh", "py", "en"],
                properties: {
                  zh: { type: "string" },
                  py: { type: "string" },
                  en: { type: "string" },
                },
              },
            },
            notes: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a Mandarin Chinese lexicographer producing flashcard entries for a character-study app. The user gives you vocabulary in any form — a typed list, a photo or screenshot of a textbook page, chat log, menu, sign, or handwritten notes. Extract every distinct Chinese vocabulary item and produce one card entry per item.

Rules:
- pinyin uses tone marks (shuǐ), not tone numbers.
- meaning is a concise English gloss; separate distinct senses with semicolons.
- pos values are lowercase English: noun, verb, pronoun, adjective, adverb, measure word, particle, bound form, preposition, numeral, conjunction, interjection, prefix, suffix. A word can have several.
- compound is true for multi-character words, false for single characters.
- For every multi-character word you extract, ALSO emit one entry per component character (compound: false) unless that character only exists in transliterations. For characters that rarely stand alone, use pos ["bound form"] and a meaning like "used in 咖啡 (coffee)".
- radical and strokes: fill in for single characters; omit for compounds.
- examples: 2-3 short, natural examples with zh (hanzi), py (pinyin with tone marks), en (English). For component characters, the first example should be the compound they came from.
- notes: one or two sentences — character etymology or structure (radical + phonetic), usage warnings, tone-change rules, or a memorable mnemonic. Write like a good textbook footnote.
- Simplified characters unless the source is clearly traditional.
- Deduplicate: one entry per distinct hanzi string.
- If the image contains no Chinese vocabulary, return an empty cards array.`;

aiRoute.post("/extract", async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI generation is not configured on this server (missing ANTHROPIC_API_KEY)." }, 503);
  }

  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
  }
  const { text, image } = parsed.data;

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    });
  }
  content.push({
    type: "text",
    text: text?.trim()
      ? `Create card entries for this vocabulary:\n\n${text.trim()}`
      : "Create card entries for all Chinese vocabulary in this image.",
  });

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: outputFormat },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return c.json({ error: "The model declined this input — try different content." }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return c.json({ error: "Too much vocabulary for one request — split the input and try again." }, 422);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return c.json({ error: "The model returned no usable output — try again." }, 502);
    }
    const { cards } = JSON.parse(textBlock.text) as { cards: unknown[] };
    return c.json({ cards });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return c.json({ error: "AI service is rate-limited right now — try again in a minute." }, 429);
    }
    if (err instanceof Anthropic.APIError && err.message.includes("credit balance")) {
      return c.json({ error: "The AI account is out of credits — top up at console.anthropic.com → Billing." }, 502);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[ai] Anthropic API error ${err.status}: ${err.message}`);
      return c.json({ error: "AI generation failed — try again." }, 502);
    }
    throw err;
  }
});
