import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canExam, formatInterval, isCollected, isDue, isMastered, isScheduled, MASTERY_MARKS, masteryLabel, masteryMarks, masteryOf, masteryProgress, previewIntervalDays, proofCount } from "./srs.js";
import type { SeenRecord } from "../types.js";

const NOW = Date.UTC(2026, 6, 26);
const DAY = 24 * 60 * 60 * 1000;

function rec(over: Partial<SeenRecord> = {}): SeenRecord {
  return { last: NOW, views: 1, ease: 2.5, intervalDays: 1, due: NOW + DAY, reps: 1, lapses: 0, ...over };
}

describe("masteryOf", () => {
  it("is 0 for a card that has never been graded", () => {
    assert.equal(masteryOf(undefined), 0);
    assert.equal(masteryOf(rec({ reps: 0 })), 0);
  });

  it("climbs with the scheduled interval", () => {
    assert.equal(masteryOf(rec({ intervalDays: 1 })), 1);
    assert.equal(masteryOf(rec({ intervalDays: 7 })), 2);
    assert.equal(masteryOf(rec({ intervalDays: 21 })), 3);
    assert.equal(masteryOf(rec({ intervalDays: 200 })), 4);
  });

  it("never exceeds the documented maximum", () => {
    assert.equal(masteryOf(rec({ intervalDays: 365, reps: 40 })), 4);
  });

  it("caps a low-ease card even on a long interval", () => {
    // Interval alone would say 4; the ease says it keeps needing help.
    assert.equal(masteryOf(rec({ intervalDays: 200, ease: 1.3 })), 2);
  });

  it("caps a card that keeps being forgotten outright", () => {
    assert.equal(masteryOf(rec({ intervalDays: 200, lapses: 5 })), 2);
  });

  it("does not cap a card with only occasional lapses", () => {
    assert.equal(masteryOf(rec({ intervalDays: 200, lapses: 2 })), 4);
  });

  it("tolerates records missing the SRS fields entirely", () => {
    // A pre-SRS cached record: seen, but no scheduling data.
    assert.equal(masteryOf({ last: NOW, views: 3 }), 0);
  });
});

describe("masteryLabel", () => {
  it("names every level and falls back safely", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(masteryLabel),
      ["new", "learning", "familiar", "strong", "mastered"]);
    assert.equal(masteryLabel(99), "new");
  });
});

describe("isDue / isScheduled", () => {
  it("treats never-seen and never-graded cards as due", () => {
    assert.equal(isDue(undefined, NOW), true);
    assert.equal(isDue({ last: NOW, views: 1 }, NOW), true);
  });

  it("respects a future due date", () => {
    assert.equal(isDue(rec({ due: NOW + DAY }), NOW), false);
    assert.equal(isDue(rec({ due: NOW - DAY }), NOW), true);
  });

  it("only counts graded cards as scheduled", () => {
    assert.equal(isScheduled(rec()), true);
    assert.equal(isScheduled(rec({ reps: 0 })), false);
    assert.equal(isScheduled(undefined), false);
  });
});

describe("formatInterval", () => {
  it("scales the unit to the magnitude", () => {
    assert.equal(formatInterval(10 / (24 * 60)), "10m");
    assert.equal(formatInterval(1), "1d");
    assert.equal(formatInterval(30), "4w");
    assert.equal(formatInterval(90), "3mo");
    assert.equal(formatInterval(365), "1.0y");
  });
});

describe("previewIntervalDays", () => {
  it("mirrors the server ladder for a fresh card", () => {
    assert.equal(previewIntervalDays(undefined, "good"), 1);
    assert.equal(previewIntervalDays(undefined, "easy"), 3);
    assert.ok(previewIntervalDays(undefined, "again") < 1 / 24);
  });

  it("orders the grades by how far out they push the card", () => {
    const r = rec({ intervalDays: 10, reps: 4 });
    const again = previewIntervalDays(r, "again");
    const hard = previewIntervalDays(r, "hard");
    const good = previewIntervalDays(r, "good");
    const easy = previewIntervalDays(r, "easy");
    assert.ok(again < hard && hard < good && good < easy,
      `expected again < hard < good < easy, got ${again}/${hard}/${good}/${easy}`);
  });
});

describe("collection", () => {
  it("needs all three proofs, not two", () => {
    assert.equal(isCollected({ last: 0, views: 1, readOk: true }), false);
    assert.equal(isCollected({ last: 0, views: 1, writeOk: true }), false);
    assert.equal(isCollected({ last: 0, views: 1, brushOk: true }), false);
    assert.equal(isCollected({ last: 0, views: 1, readOk: true, writeOk: true }), false);
    assert.equal(isCollected({ last: 0, views: 1, readOk: true, brushOk: true }), false);
    assert.equal(isCollected({ last: 0, views: 1, writeOk: true, brushOk: true }), false);
    assert.equal(
      isCollected({ last: 0, views: 1, readOk: true, writeOk: true, brushOk: true }), true);
  });

  it("treats a card that has never been graded as uncollected", () => {
    assert.equal(isCollected(undefined), false);
    assert.equal(isCollected({ last: 0, views: 3 }), false);
  });

  it("does not follow the schedule down — an earned slot stays earned", () => {
    // Forgotten badly: ease floored, lapses piling up, interval reset. The
    // scheduler should say "weak" while the dex still says "collected".
    const lapsed = {
      last: 0, views: 20, ease: 1.3, intervalDays: 0, reps: 0, lapses: 5,
      readOk: true, writeOk: true, brushOk: true,
    };
    assert.equal(masteryOf(lapsed), 0);
    assert.equal(isCollected(lapsed), true);
  });

  it("counts how far along a card is", () => {
    assert.equal(proofCount(undefined), 0);
    assert.equal(proofCount({ last: 0, views: 1, readOk: true }), 1);
    assert.equal(proofCount({ last: 0, views: 1, readOk: true, writeOk: true }), 2);
    assert.equal(
      proofCount({ last: 0, views: 1, readOk: true, writeOk: true, brushOk: true }), 3);
  });
});

describe("mastery (the 考 exam)", () => {
  const collected = { last: 0, views: 5, readOk: true, writeOk: true, brushOk: true };
  const full = { ...collected, readMarks: MASTERY_MARKS, writeMarks: MASTERY_MARKS, brushMarks: MASTERY_MARKS };

  it("reads marks back, clamped and defaulted", () => {
    assert.deepEqual(masteryMarks(undefined), { read: 0, write: 0, brush: 0 });
    assert.deepEqual(masteryMarks({ last: 0, views: 1, readMarks: 2 }), { read: 2, write: 0, brush: 0 });
    // Never reports past the cap even if the row somehow overran.
    assert.equal(masteryMarks({ last: 0, views: 1, brushMarks: 99 }).brush, MASTERY_MARKS);
  });

  it("is mastered only with full marks in every direction", () => {
    assert.equal(isMastered(undefined), false);
    assert.equal(isMastered(collected), false);
    // Two of three maxed is not mastery — every skill has to clear.
    assert.equal(isMastered({ ...full, brushMarks: MASTERY_MARKS - 1 }), false);
    assert.equal(isMastered(full), true);
  });

  it("sums progress toward the shiny", () => {
    assert.equal(masteryProgress(undefined), 0);
    assert.equal(masteryProgress({ ...collected, readMarks: 3, writeMarks: 1 }), 4);
    assert.equal(masteryProgress(full), MASTERY_MARKS * 3);
  });

  it("only lets collected, unmastered cards sit the exam", () => {
    assert.equal(canExam(undefined), false);
    // Half-collected — nothing strict to prove yet.
    assert.equal(canExam({ last: 0, views: 1, readOk: true, writeOk: true }), false);
    assert.equal(canExam(collected), true);
    // Already shiny — no exam left to sit.
    assert.equal(canExam(full), false);
  });
});
