import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availableLevels, BEYOND_ID, buildSession, filterByLevels, sessionSize, stepFor } from "./difficulty.js";
import type { Card, SeenMap } from "../types.js";

const NOW = Date.UTC(2026, 6, 24);
const DAY = 24 * 60 * 60 * 1000;

function card(hanzi: string, id = hanzi): Card {
  return { id, hanzi, pinyin: "x", meaning: "x", pos: [], compound: false, added: "2026-01-01" };
}

// 爱/八 are HSK 1; 吧 is HSK 1 too. 마 isn't a hanzi at all, so it lands "beyond".
const HSK1 = ["爱", "八", "吧", "白", "百", "班", "半", "帮", "包", "杯"];

/** Seen record scheduled comfortably into the future — i.e. "known". */
function known(days = 30) {
  return { last: NOW, views: 5, ease: 2.5, intervalDays: days, due: NOW + days * DAY, reps: 4, lapses: 0 };
}
/** Seen record that's overdue by `days`. */
function overdue(days = 5) {
  return { last: NOW, views: 3, ease: 2.0, intervalDays: 2, due: NOW - days * DAY, reps: 2, lapses: 1 };
}

describe("filterByLevels", () => {
  const pool = [card("爱"), card("吧"), card("咖啡", "compound")];

  it("treats an empty selection as 'everything'", () => {
    assert.equal(filterByLevels(pool, []).length, 3);
  });

  it("keeps only the chosen HSK levels", () => {
    const only1 = filterByLevels(pool, ["1"]);
    assert.ok(only1.every(c => c.hanzi !== "咖啡"));
    assert.ok(only1.length >= 2);
  });

  it("buckets off-dex entries under 'beyond'", () => {
    const beyond = filterByLevels(pool, [BEYOND_ID]);
    assert.deepEqual(beyond.map(c => c.hanzi), ["咖啡"]);
  });
});

describe("availableLevels", () => {
  it("reports only levels the bank actually contains, with counts", () => {
    const levels = availableLevels([card("爱"), card("八"), card("咖啡", "c")]);
    const hsk1 = levels.find(l => l.id === "1");
    assert.equal(hsk1?.count, 2);
    assert.equal(levels.find(l => l.id === BEYOND_ID)?.count, 1);
    assert.ok(!levels.some(l => l.id === "6"), "empty levels should be omitted");
  });
});

describe("buildSession", () => {
  const pool = HSK1.map(h => card(h));

  it("caps the session at the difficulty step's card count", () => {
    const big = Array.from({ length: 100 }, (_, i) => card("爱", `c${i}`));
    assert.equal(buildSession(big, {}, 0, NOW).length, stepFor(0).cards);
    assert.equal(buildSession(big, {}, 4, NOW).length, stepFor(4).cards);
  });

  it("never returns more cards than the pool holds", () => {
    assert.equal(buildSession(pool.slice(0, 3), {}, 4, NOW).length, 3);
  });

  it("leads with the most overdue card", () => {
    const srs: SeenMap = { 爱: known(), 八: overdue(1), 吧: overdue(20) };
    assert.equal(buildSession(pool, srs, 2, NOW)[0].hanzi, "吧");
  });

  it("mixes in known cards at low difficulty but not at the top step", () => {
    // 3 cards need work, the rest are comfortably scheduled.
    const srs: SeenMap = Object.fromEntries(pool.map((c, i) => [c.id, i < 3 ? overdue(i + 1) : known()]));

    const gentle = buildSession(pool, srs, 0, NOW);
    const gentleKnown = gentle.filter(c => srs[c.id] && srs[c.id].due! > NOW).length;
    assert.ok(gentleKnown > 0, "gentle sessions should include revision of known cards");

    const relentless = buildSession(pool, srs, 4, NOW);
    // Only 3 cards actually need work, so the rest backfill — but those 3 lead.
    assert.deepEqual(relentless.slice(0, 3).map(c => c.hanzi).sort(), ["八", "吧", "爱"].sort());
  });

  it("still fills the session when nothing is due", () => {
    const srs: SeenMap = Object.fromEntries(pool.map(c => [c.id, known()]));
    assert.equal(buildSession(pool, srs, 0, NOW).length, Math.min(stepFor(0).cards, pool.length));
  });

  it("returns no duplicates when backfilling", () => {
    const srs: SeenMap = { 爱: overdue() };
    const out = buildSession(pool, srs, 4, NOW);
    assert.equal(new Set(out.map(c => c.id)).size, out.length);
  });
});

describe("sessionSize", () => {
  it("is the smaller of the pool and the step's cap", () => {
    assert.equal(sessionSize(HSK1.map(h => card(h)), 4), 10);
    assert.equal(sessionSize(HSK1.map(h => card(h)), 0), 10);
    assert.equal(sessionSize([card("爱")], 2), 1);
  });
});
