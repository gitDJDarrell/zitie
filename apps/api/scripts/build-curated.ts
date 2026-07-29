// Turns the hand-written character stories in data/stories.json into a seed
// file, filling in everything that can be looked up rather than typed.
//
// Roadmap Backlog #1: the generated pass covers all 3,000 dex characters, but
// the ones whose etymology the dataset doesn't record fall back to saying so
// ("the data records the parts but no account of…"). Those are the flat ones,
// and this is where they get a real account written by hand.
//
// The hand-written half is only what a person actually has to decide: which
// components are worth naming, what each one is doing, and the story. Readings
// and glosses come from the bundled dataset, structure and compounds from the
// generated pass — so a curated entry never drifts from the data behind it,
// and a typo in a component character fails the build instead of shipping.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lookupHanzi } from "../src/lib/hanzi.js";
import { verifiedComponents } from "../src/lib/enrich.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const read = (name: string) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

type Role = "semantic" | "phonetic" | "meaning" | "form";

/** What a person writes. Everything else is derived. */
interface Authored {
  hanzi: string;
  etyType: "pictophonetic" | "ideographic" | "pictographic" | "none";
  /**
   * In written order. `gloss` overrides the dataset's when it is too broad or
   * when the shape is not being read as the standalone character. `reading:
   * null` suppresses the dataset reading for the same reason — 去's top is 大
   * worn down, so labelling it "tǔ" would be worse than saying nothing.
   */
  components: { char: string; role: Role; note?: string; gloss?: string; reading?: string | null }[];
  story: string;
  /** Only when the generated structure is wrong or absent. */
  structure?: string;
}

interface Generated {
  hanzi: string;
  structure?: string | null;
  compounds?: { zh: string; py?: string; en?: string }[];
}

const authored = read("stories.json") as Authored[];
const generated = new Map((read("insights-hsk.json") as Generated[]).map((g) => [g.hanzi, g]));
const problems: string[] = [];

const rows = authored.map((a) => {
  const facts = lookupHanzi(a.hanzi);
  const gen = generated.get(a.hanzi);
  if (!facts) problems.push(`${a.hanzi}: not in the bundled dataset`);
  if (!gen) problems.push(`${a.hanzi}: not a dex character — nothing to override`);

  // The same grounding rule the runtime worker enforces: a breakdown may only
  // name components the dataset places inside the character.
  const allowed = verifiedComponents(a.hanzi);
  const seen = new Set<string>();
  for (const c of a.components) {
    if (!allowed.has(c.char)) problems.push(`${a.hanzi}: ${c.char} is not a component of it`);
    if (seen.has(c.char)) problems.push(`${a.hanzi}: ${c.char} listed twice`);
    seen.add(c.char);
  }
  if (a.etyType === "pictophonetic" && !a.components.some((c) => c.role === "phonetic")) {
    problems.push(`${a.hanzi}: pictophonetic with no phonetic component`);
  }
  if (a.etyType !== "pictophonetic" && a.components.some((c) => c.role === "semantic" || c.role === "phonetic")) {
    problems.push(`${a.hanzi}: semantic/phonetic roles only apply to a pictophonetic character`);
  }
  if (!a.story.trim()) problems.push(`${a.hanzi}: empty story`);

  return {
    hanzi: a.hanzi,
    structure: a.structure ?? gen?.structure ?? null,
    etyType: a.etyType,
    components: a.components.map((c) => {
      const r = reading(c);
      return {
        char: c.char,
        ...(r ? { reading: r } : {}),
        // A dataset gloss is a dictionary dump ("to combine, to join, to
        // unite; to gather"); the first sense is what belongs on a card. A
        // phonetic component gets none unless one was written by hand — its
        // meaning is beside the point here, and printing it invites the reader
        // to work it into a story it has nothing to do with.
        ...(gloss(c) ? { gloss: gloss(c) } : {}),
        role: c.role,
        ...(c.note ? { note: c.note } : {}),
      };
    }),
    story: a.story.trim(),
    compounds: gen?.compounds ?? [],
  };
});

type Comp = Authored["components"][number];

/**
 * A "form" component is a shape rather than a character being read, so it gets
 * no reading — printing one invites the reader to sound out a stroke group
 * that is not pronounced. Anywhere else the author can suppress it explicitly.
 */
function reading(c: Comp): string | undefined {
  if (c.reading !== undefined) return c.reading ?? undefined;
  if (c.role === "form") return undefined;
  return lookupHanzi(c.char)?.readings[0];
}

function gloss(c: Comp): string | undefined {
  if (c.gloss) return c.gloss;
  // Same reasoning as the reading: a "form" component is a stroke group, and
  // the dictionary sense of the character that happens to share its shape is
  // an invitation to build a story out of something that isn't there.
  if (c.role === "phonetic" || c.role === "form") return undefined;
  const first = lookupHanzi(c.char)?.gloss?.split(/[;,]/)[0]?.trim();
  return first || undefined;
}

const dupes = rows.map((r) => r.hanzi).filter((h, i, all) => all.indexOf(h) !== i);
if (dupes.length) problems.push(`duplicated entries: ${[...new Set(dupes)].join(" ")}`);

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

writeFileSync(join(dataDir, "insights-curated.json"), JSON.stringify(rows, null, 2) + "\n");
const noCompounds = rows.filter((r) => !r.compounds.length).length;
console.log(`Wrote insights-curated.json — ${rows.length} hand-written breakdowns`
  + (noCompounds ? ` (${noCompounds} without compounds)` : ""));
