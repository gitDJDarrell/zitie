// Builds the two reference datasets a release ships with, so every HSK item a
// user can unlock already has its data:
//
//   data/insights-hsk.json — a breakdown for all 3,000 HSK 3.0 dex characters
//   data/hsk-words.json    — all 11,000+ HSK 3.0 words with pinyin, gloss,
//                            part of speech where the standard annotates one,
//                            and the level they are first examinable at
//
// Sources (all open, all downloaded fresh — none are committed):
//   - HSK 3.0 word list — github.com/elkmovie/hsk30, (c) 2021 Pleco Inc., MIT
//   - CC-CEDICT — Creative Commons Attribution-Share Alike 3.0, via the
//     `hanzi` npm package, which bundles the MDBG release
//   - Leiden Weibo Corpus word frequencies — bundled in the same package,
//     used only to rank which compounds to show first
//   - data/hanzi.json — the committed IDS/Unihan distillation (see
//     build-hanzi-data.ts)
//
// Run when refreshing the seed data; normal builds read the committed JSON:
//
//   npm run build:reference --workspace apps/api
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { componentEntries, pickCompounds, storyFor, structureFor, type CompoundCandidate } from "../src/lib/breakdown.js";
import { parseCedict, parseHskWordlist, type DictEntry } from "../src/lib/cedict.js";
import { lookupHanzi } from "../src/lib/hanzi.js";

const here = dirname(fileURLToPath(import.meta.url));
const INSIGHTS_OUT = join(here, "../data/insights-hsk.json");
const WORDS_OUT = join(here, "../data/hsk-words.json");
const SUPPLEMENT = join(here, "../data/hsk-words-supplement.json");
const READINGS = join(here, "../data/readings-override.json");
const DEX = join(here, "../../web/src/data/dex.ts");

const HSK_WORDLIST_URL = "https://raw.githubusercontent.com/elkmovie/hsk30/main/wordlist.txt";
// CC-CEDICT is not served from a URL this environment can reach; the `hanzi`
// npm package republishes the MDBG file verbatim (with its license header).
const HANZI_PKG_URL = "https://registry.npmjs.org/hanzi/-/hanzi-2.2.1.tgz";

async function download(url: string, path: string): Promise<void> {
  if (existsSync(path) && statSync(path).size > 0) {
    console.log(`· ${path.split("/").pop()} already present`);
    return;
  }
  console.log(`· downloading ${url.split("/").pop()}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

/** The dex is defined in the web app; read the levels straight out of it. */
function readDexLevels(): { level: string; chars: string[] }[] {
  const src = readFileSync(DEX, "utf8");
  const levels: { level: string; chars: string[] }[] = [];
  const re = /id: "([^"]+)", label: "[^"]+",\s*\n?\s*zh: "[^"]+",\s*\n?\s*chars: "([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) levels.push({ level: match[1], chars: [...match[2]] });
  if (!levels.length) throw new Error("could not read DEX_LEVELS out of the web dex");
  return levels;
}

async function main() {
  const srcDir = process.argv[2] ?? join(tmpdir(), "zitie-reference-src");
  mkdirSync(srcDir, { recursive: true });

  const wordlistPath = join(srcDir, "hsk-wordlist.txt");
  const pkgPath = join(srcDir, "hanzi.tgz");
  await download(HSK_WORDLIST_URL, wordlistPath);
  await download(HANZI_PKG_URL, pkgPath);

  // The npm tarball holds CC-CEDICT and the frequency list as JS modules that
  // export one big template string.
  const { execFileSync } = await import("node:child_process");
  const cedictPath = join(srcDir, "package/lib/data/cedict_ts.u8.js");
  const freqPath = join(srcDir, "package/lib/data/leidenfreqdata.txt.js");
  if (!existsSync(cedictPath) || !existsSync(freqPath)) {
    execFileSync("tar", ["xzf", pkgPath, "-C", srcDir,
      "package/lib/data/cedict_ts.u8.js", "package/lib/data/leidenfreqdata.txt.js"]);
  }
  const unwrap = (path: string) => {
    const raw = readFileSync(path, "utf8");
    return raw.slice(raw.indexOf("`") + 1, raw.lastIndexOf("`"));
  };

  // Which reading of a heteronym a learner meets first is not something the
  // dictionary's file order or its sense counts always get right — 打 is dǎ,
  // not dá ("a dozen"). data/readings-override.json is the hand-checked list
  // of the ones that come out wrong; everything else falls back to the
  // sense-count heuristic in parseCedict.
  const commonReading = new Map<string, string>(
    Object.entries(JSON.parse(readFileSync(READINGS, "utf8")) as Record<string, string>),
  );

  const dict = parseCedict(unwrap(cedictPath), commonReading);
  const hskWords = parseHskWordlist(readFileSync(wordlistPath, "utf8"));
  const levels = readDexLevels();
  console.log(`· ${dict.size} dictionary entries, ${hskWords.length} HSK words, ${levels.length} dex levels`);

  const freq = new Map<string, number>();
  for (const line of unwrap(freqPath).split("\n")) {
    const [word, count] = line.split(",");
    if (word && count) freq.set(word, Number(count) || 0);
  }

  // ——— the word bank ———
  // CC-CEDICT lists words, not transparent phrases, so a couple of hundred
  // list entries (车上, 看到, 说到底) have no dictionary row. Those are written
  // by hand in data/hsk-words-supplement.json — the in-session seeding the
  // roadmap calls for — and fill the gaps here.
  const supplement = new Map<string, DictEntry>(
    (JSON.parse(readFileSync(SUPPLEMENT, "utf8")) as DictEntry[]).map((e) => [e.zh, e]),
  );

  // A few list entries are grammar patterns rather than words ("…极了",
  // "…分之…"); the dictionary knows the pattern's fixed part, so look that up
  // when the whole string misses.
  const define = (zh: string): DictEntry | undefined =>
    dict.get(zh) ?? supplement.get(zh) ?? (zh.includes("…") ? dict.get(zh.replace(/…/g, "")) : undefined);

  const words = hskWords.map((word) => {
    const entry: DictEntry | undefined = define(word.zh);
    return {
      zh: word.zh,
      py: entry?.py ?? null,
      en: entry?.en ?? null,
      level: word.level,
      levels: word.levels,
      pos: word.pos,
      compound: [...word.zh].length > 1,
    };
  });
  const undefined_ = words.filter((w) => !w.en).length;
  writeFileSync(WORDS_OUT, `${JSON.stringify(words)}\n`);
  console.log(`Wrote ${words.length} HSK words to data/hsk-words.json (${Math.round(statSync(WORDS_OUT).size / 1024)} KB)`);
  console.log(`· ${undefined_} word(s) the dictionary doesn't define — left null for the app to fill`);

  // ——— the character breakdowns ———
  // Index HSK vocabulary by the characters it contains, so a character's
  // "appears in" list is drawn from words the learner will actually meet.
  const byChar = new Map<string, CompoundCandidate[]>();
  for (const word of words) {
    if (!word.compound || !word.py || !word.en) continue;
    for (const char of new Set([...word.zh])) {
      const list = byChar.get(char) ?? [];
      list.push({ zh: word.zh, py: word.py, en: word.en, level: word.level, freq: freq.get(word.zh) ?? 0 });
      byChar.set(char, list);
    }
  }

  // Some characters — mostly in the advanced tier — appear in no multi-
  // character HSK word at all. Rather than show them with nothing under
  // "appears in", fall back to the dictionary at large, most common first.
  // These carry no level, so they always sort after examinable vocabulary.
  const dictByChar = new Map<string, CompoundCandidate[]>();
  for (const [zh, entry] of dict) {
    const length = [...zh].length;
    if (length < 2 || length > 3 || !freq.has(zh)) continue;
    for (const char of new Set([...zh])) {
      if (byChar.has(char)) continue; // HSK vocabulary already covers it
      const list = dictByChar.get(char) ?? [];
      list.push({ zh, py: entry.py, en: entry.en, freq: freq.get(zh) ?? 0 });
      dictByChar.set(char, list);
    }
  }

  const insights = [];
  const uncovered: string[] = [];
  for (const { chars } of levels) {
    for (const char of chars) {
      const facts = lookupHanzi(char);
      if (!facts) { uncovered.push(char); continue; }
      insights.push({
        hanzi: char,
        structure: structureFor(facts),
        etyType: facts.etymology?.type ?? "none",
        components: componentEntries(facts, lookupHanzi),
        story: storyFor(facts, lookupHanzi),
        compounds: pickCompounds(char, byChar.get(char) ?? dictByChar.get(char) ?? []),
      });
    }
  }

  writeFileSync(INSIGHTS_OUT, `${JSON.stringify(insights)}\n`);
  console.log(`Wrote ${insights.length} character breakdowns to data/insights-hsk.json (${Math.round(statSync(INSIGHTS_OUT).size / 1024)} KB)`);
  if (uncovered.length) console.log(`· ${uncovered.length} dex character(s) the dataset doesn't cover: ${uncovered.join("")}`);
  const noCompounds = insights.filter((i) => !i.compounds.length).length;
  console.log(`· ${noCompounds} character(s) with no HSK word to show under "appears in"`);
}

main().catch((err) => { console.error(err); process.exit(1); });
