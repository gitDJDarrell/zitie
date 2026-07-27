// Runtime enrichment for characters no seed pass has covered: a background
// worker that runs a tool-use loop over the bundled IDS/Unihan lookups and
// writes the result to the shared character_insights cache.
//
// Roadmap Track A, runtime half. Two things keep the promise that the model
// explains verified structure rather than inventing it: the only source of
// structural fact is the lookup tool (the model cannot see the dataset any
// other way), and groundComponents() drops any component the dataset doesn't
// place inside the character before the row is written.
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { characterInsights } from "../db/schema.js";
import { lookupHanzi, type HanziFacts } from "./hanzi.js";

// The roadmap splits models by economics: a cheap one for the hot-path
// screenshot extraction, the top tier for enrichment, which happens once per
// character and is then reused by every user forever.
const MODEL = "claude-opus-5";

export type ComponentRole = "semantic" | "phonetic" | "meaning" | "form";

export interface DraftInsight {
  structure?: string;
  etyType?: string;
  components?: { char: string; reading?: string; gloss?: string; role: ComponentRole; note?: string }[];
  story?: string;
  compounds?: { zh: string; py?: string; en?: string }[];
}

/**
 * Every character the dataset places inside `hanzi`, down `depth` levels —
 * the set a breakdown is allowed to talk about. Depth 2 covers the roadmap's
 * "recursively for components worth explaining" without opening the door to
 * arbitrary characters.
 */
export function verifiedComponents(hanzi: string, depth = 2): Set<string> {
  const found = new Set<string>();
  const walk = (char: string, left: number) => {
    const facts = lookupHanzi(char);
    if (!facts) return;
    if (facts.radical && facts.radical !== char) found.add(facts.radical);
    for (const comp of facts.components) {
      if (comp === hanzi || found.has(comp)) continue;
      found.add(comp);
      if (left > 1) walk(comp, left - 1);
    }
  };
  walk(hanzi, depth);
  return found;
}

/**
 * Drops components the dataset doesn't place inside the character. The prompt
 * already says not to invent them; this is the part that holds when the prompt
 * doesn't.
 */
export function groundComponents(hanzi: string, draft: DraftInsight): DraftInsight["components"] {
  const allowed = verifiedComponents(hanzi);
  const seen = new Set<string>();
  return (draft.components ?? []).filter((c) => {
    if (!allowed.has(c.char) || seen.has(c.char)) return false;
    seen.add(c.char);
    return true;
  });
}

/** A compound only belongs on a character's card if it contains that character. */
export function groundCompounds(hanzi: string, draft: DraftInsight): DraftInsight["compounds"] {
  return (draft.compounds ?? []).filter((w) => w.zh.includes(hanzi)).slice(0, 4);
}

/** The tool result for one lookup — the model's only window onto the dataset. */
export function characterFacts(char: string): Record<string, unknown> {
  const facts: HanziFacts | null = char.length === 1 ? lookupHanzi(char) : null;
  if (!facts) return { hanzi: char, known: false };
  return {
    hanzi: facts.hanzi,
    known: true,
    ...(facts.decomposition ? { decomposition: facts.decomposition } : {}),
    ...(facts.components.length ? { components: facts.components } : {}),
    ...(facts.radical ? { radical: facts.radical } : {}),
    ...(facts.readings.length ? { readings: facts.readings } : {}),
    ...(facts.gloss ? { gloss: facts.gloss } : {}),
    ...(facts.strokes ? { strokes: facts.strokes } : {}),
    ...(facts.etymology ? { etymology: facts.etymology } : {}),
  };
}

const LOOKUP_TOOL: Anthropic.Tool = {
  name: "lookup_character",
  description:
    "Look up verified structural facts for one Chinese character: its IDS decomposition, component characters, radical, Mandarin readings, English gloss, stroke count, and etymology type. Call it for the character being explained and for every component you intend to mention, including components of components. Returns {\"known\": false} for characters the dataset does not cover.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["hanzi"],
    properties: {
      hanzi: { type: "string", description: "Exactly one Chinese character." },
    },
  },
};

const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["structure", "etyType", "components", "story", "compounds"],
    properties: {
      structure: { type: "string", description: 'Human-readable shape, e.g. "⿰ left–right" or "simple / indivisible".' },
      etyType: { type: "string", enum: ["pictophonetic", "ideographic", "pictographic", "none"] },
      components: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["char", "role"],
          properties: {
            char: { type: "string" },
            reading: { type: "string" },
            gloss: { type: "string" },
            role: { type: "string", enum: ["semantic", "phonetic", "meaning", "form"] },
            note: { type: "string" },
          },
        },
      },
      story: { type: "string" },
      compounds: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["zh"],
          properties: {
            zh: { type: "string" },
            py: { type: "string" },
            en: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You write the deep breakdown shown on a Chinese character's card in a study app. The reader is an adult learner who knows pinyin and a few hundred characters.

Ground every structural claim in the lookup tool. Call lookup_character for the character itself, then for each component you plan to name, and for a component's own components when they are worth explaining. Never state a component, radical, reading, or decomposition the tool did not return — if the tool says a character is unknown, leave it out rather than reasoning from memory.

Fields:
- structure: the shape in plain words — "⿰ left–right", "⿱ stacked", "⿺ enclosing", or "simple / indivisible" for a character with no meaningful parts.
- etyType: pictophonetic when one component carries the sound and another the meaning; pictographic when the whole character is a picture; ideographic when the parts combine by meaning; none when the data supports no account.
- components: one entry per part worth explaining, in written order. role is "semantic" or "phonetic" only for a pictophonetic character (matching the etymology's semantic/phonetic fields), otherwise "meaning" for a part contributing sense and "form" for a part that is only a shape. reading and gloss come from the lookup. note is one short sentence on what that part does here. Empty array for an indivisible character.
- story: two or three sentences tying the parts to the character's meaning — the thing a learner remembers. Say plainly when the modern form obscures the original one. No invented folk etymology.
- compounds: two to four common modern words containing the character, with pinyin (tone marks) and a short English gloss.

Write like a good textbook footnote: concrete, unfussy, no hedging.`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * The slice of the SDK this loop uses. Narrow on purpose: it lets the loop be
 * driven by a scripted client in tests, so the mechanics — that the tool gets
 * called, that its results are fed back, that the final JSON is parsed and
 * grounded — are checked without a key or a live call.
 */
export interface MessageClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * One enrichment: a tool-use loop the model drives, ending in a structured
 * breakdown. Exported for scripts that want to generate without the queue.
 */
export async function generateInsight(hanzi: string, api: MessageClient = anthropic()): Promise<DraftInsight> {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Write the breakdown for 「${hanzi}」. Look it up first.`,
  }];

  // Enough turns for the character plus a handful of components; a loop that
  // wanders past this is not converging and should not keep spending.
  for (let turn = 0; turn < 10; turn++) {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: [LOOKUP_TOOL],
      output_config: { format: OUTPUT_FORMAT },
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("model declined the character");
    if (response.stop_reason === "max_tokens") throw new Error("breakdown exceeded the token budget");

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length) {
      messages.push({
        role: "user",
        content: toolUses.map((use): Anthropic.ToolResultBlockParam => ({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(characterFacts(String((use.input as { hanzi?: unknown }).hanzi ?? ""))),
        })),
      });
      continue;
    }

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!text) throw new Error("model returned no breakdown");
    return JSON.parse(text.text) as DraftInsight;
  }
  throw new Error("enrichment did not converge");
}

// ——— queue ———
// One character at a time, in-process: enrichment is a background nicety, not
// something a user waits on, and serialising it keeps a burst of card opens
// from fanning out into parallel model calls.

const pending: string[] = [];
const queued = new Set<string>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 60 * 60 * 1000;
let draining = false;

export function isEnrichmentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Characters currently queued or being worked on. */
export function pendingEnrichment(): string[] {
  return [...queued];
}

/**
 * Queue characters for enrichment, skipping anything the dataset can't ground,
 * anything already queued, and anything that failed within the last hour —
 * a card the user keeps reopening shouldn't re-run a failing job every time.
 */
export function requestEnrichment(hanzi: string[]): { queued: string[]; unavailable: string[] } {
  const accepted: string[] = [];
  const unavailable: string[] = [];
  const now = Date.now();

  for (const char of hanzi) {
    if (queued.has(char)) { accepted.push(char); continue; }
    const failed = failedAt.get(char);
    if (char.length !== 1 || !lookupHanzi(char) || !isEnrichmentConfigured()
        || (failed !== undefined && now - failed < RETRY_AFTER_MS)) {
      unavailable.push(char);
      continue;
    }
    queued.add(char);
    pending.push(char);
    accepted.push(char);
  }

  if (accepted.length) void drain();
  return { queued: accepted, unavailable };
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    let char: string | undefined;
    while ((char = pending.shift()) !== undefined) {
      try {
        await enrichAndStore(char);
        failedAt.delete(char);
      } catch (err) {
        failedAt.set(char, Date.now());
        console.error(`[enrich] ${char}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        queued.delete(char);
      }
    }
  } finally {
    draining = false;
  }
}

async function enrichAndStore(hanzi: string): Promise<void> {
  // Imported here, not at the top: db/client throws when DATABASE_URL is unset,
  // and everything else in this module — the grounding rules especially — is
  // pure and worth being able to import without a database.
  const { db } = await import("../db/client.js");

  const existing = await db.select({ hanzi: characterInsights.hanzi })
    .from(characterInsights).where(eq(characterInsights.hanzi, hanzi));
  if (existing.length) return; // a seed pass got there first

  const draft = await generateInsight(hanzi);
  await db.insert(characterInsights).values({
    hanzi,
    structure: draft.structure ?? null,
    etyType: draft.etyType ?? null,
    components: (groundComponents(hanzi, draft) ?? []) as never,
    story: draft.story ?? null,
    compounds: (groundCompounds(hanzi, draft) ?? []) as never,
    source: `ai:${MODEL}`,
    // Seeded rows win: they were reviewed in-session, this one wasn't.
  }).onConflictDoNothing({ target: characterInsights.hanzi });
}
