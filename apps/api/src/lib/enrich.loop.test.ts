// Exercises the enrichment loop end to end against a scripted client.
//
// The live path still needs a key and a real call, but everything between the
// request and the stored row — that the tool is offered, that its results are
// fed back as tool_result blocks with the dataset's facts, that the final JSON
// is parsed, and that each failure mode raises rather than storing nonsense —
// is mechanical, and this is where it gets checked.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateInsight, type MessageClient } from "./enrich.js";

type Params = Parameters<MessageClient["messages"]["create"]>[0];

/** A client that replays scripted responses and records what it was asked. */
function scripted(responses: unknown[]) {
  const seen: Params[] = [];
  const client: MessageClient = {
    messages: {
      create: async (params) => {
        // Snapshot: the loop reuses one messages array across turns, so a
        // reference would show every call the same (final) conversation.
        seen.push(structuredClone(params) as Params);
        const next = responses[seen.length - 1];
        if (!next) throw new Error(`no scripted response for call ${seen.length}`);
        return next as Awaited<ReturnType<MessageClient["messages"]["create"]>>;
      },
    },
  };
  return { client, seen };
}

const toolCall = (id: string, hanzi: string) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name: "lookup_character", input: { hanzi } }],
});

const finalAnswer = (draft: unknown) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(draft) }],
});

const DRAFT = {
  structure: "⿰ left–right",
  etyType: "pictophonetic",
  components: [{ char: "口", role: "semantic" }, { char: "乞", role: "phonetic" }],
  story: "A sound-and-sense compound.",
  compounds: [{ zh: "吃饭", py: "chīfàn", en: "to eat a meal" }],
};

describe("generateInsight", () => {
  it("offers the lookup tool and asks for structured output", async () => {
    const { client, seen } = scripted([finalAnswer(DRAFT)]);
    await generateInsight("吃", client);

    const [params] = seen as unknown as Record<string, any>[];
    assert.equal(params.tools[0].name, "lookup_character");
    assert.equal(params.output_config.format.type, "json_schema");
    assert.match(params.messages[0].content, /吃/);
  });

  it("feeds the dataset's facts back as a tool result and carries on", async () => {
    const { client, seen } = scripted([toolCall("t1", "吃"), finalAnswer(DRAFT)]);
    const draft = await generateInsight("吃", client);

    // Second call carries the assistant turn plus our tool_result.
    const followUp = (seen[1] as unknown as Record<string, any>).messages;
    const result = followUp.at(-1).content[0];
    assert.equal(result.type, "tool_result");
    assert.equal(result.tool_use_id, "t1");
    const facts = JSON.parse(result.content);
    assert.equal(facts.known, true);
    assert.equal(facts.decomposition, "⿰口乞");
    assert.deepEqual(draft.components?.map((c) => c.char), ["口", "乞"]);
  });

  it("tells the model plainly when a character isn't in the dataset", async () => {
    const { client, seen } = scripted([toolCall("t1", "Z"), finalAnswer(DRAFT)]);
    await generateInsight("吃", client);
    const result = (seen[1] as unknown as Record<string, any>).messages.at(-1).content[0];
    assert.deepEqual(JSON.parse(result.content), { hanzi: "Z", known: false });
  });

  it("answers several lookups in one turn", async () => {
    const many = {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "a", name: "lookup_character", input: { hanzi: "口" } },
        { type: "tool_use", id: "b", name: "lookup_character", input: { hanzi: "乞" } },
      ],
    };
    const { client, seen } = scripted([many, finalAnswer(DRAFT)]);
    await generateInsight("吃", client);
    const results = (seen[1] as unknown as Record<string, any>).messages.at(-1).content;
    assert.deepEqual(results.map((r: { tool_use_id: string }) => r.tool_use_id), ["a", "b"]);
  });

  it("raises on a refusal rather than storing an empty breakdown", async () => {
    const { client } = scripted([{ stop_reason: "refusal", content: [] }]);
    await assert.rejects(() => generateInsight("吃", client), /declined/);
  });

  it("raises when the answer was cut off", async () => {
    const { client } = scripted([{ stop_reason: "max_tokens", content: [] }]);
    await assert.rejects(() => generateInsight("吃", client), /token budget/);
  });

  it("raises when the model returns no text to parse", async () => {
    const { client } = scripted([{ stop_reason: "end_turn", content: [] }]);
    await assert.rejects(() => generateInsight("吃", client), /no breakdown/);
  });

  it("gives up rather than looping forever on a model that only calls tools", async () => {
    const { client, seen } = scripted(Array.from({ length: 20 }, (_, i) => toolCall(`t${i}`, "口")));
    await assert.rejects(() => generateInsight("吃", client), /did not converge/);
    assert.ok(seen.length <= 10, `made ${seen.length} calls`);
  });
});
