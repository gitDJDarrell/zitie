// Guards the hand-written breakdowns against the generated pass drifting.
//
// insights-curated.json exists to cover exactly the characters the dataset
// records no etymology for — the ones whose generated story falls back to
// saying so. Rebuilding insights-hsk.json can add to that set (a data update,
// a new dex character), and nothing else would notice: the app would just
// quietly show the flat fallback again. This is the thing that notices.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { verifiedComponents } from "./enrich.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../data");
const read = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

interface Insight {
  hanzi: string;
  story?: string | null;
  components?: { char: string; role: string }[];
}

const generated = read("insights-hsk.json") as Insight[];
const curated = read("insights-curated.json") as Insight[];

// The phrase the generated pass falls back to when the data has no account.
const FLAT = /no account of/;

describe("hand-written breakdowns", () => {
  it("covers every character the generated pass has no account for", () => {
    const flat = generated.filter((g) => FLAT.test(g.story ?? "")).map((g) => g.hanzi);
    const written = new Set(curated.map((c) => c.hanzi));
    const missing = flat.filter((h) => !written.has(h));
    assert.deepEqual(missing, [], `run npm run build:curated after adding stories for: ${missing.join(" ")}`);
  });

  it("only writes about characters that are in the dex", () => {
    const dex = new Set(generated.map((g) => g.hanzi));
    const stray = curated.map((c) => c.hanzi).filter((h) => !dex.has(h));
    assert.deepEqual(stray, []);
  });

  it("names no component the dataset doesn't place inside the character", () => {
    const ungrounded: string[] = [];
    for (const entry of curated) {
      const allowed = verifiedComponents(entry.hanzi);
      for (const comp of entry.components ?? []) {
        if (!allowed.has(comp.char)) ungrounded.push(`${entry.hanzi}/${comp.char}`);
      }
    }
    assert.deepEqual(ungrounded, []);
  });

  it("says something in every story", () => {
    const empty = curated.filter((c) => !c.story || c.story.trim().length < 40 || FLAT.test(c.story));
    assert.deepEqual(empty.map((c) => c.hanzi), []);
  });
});
