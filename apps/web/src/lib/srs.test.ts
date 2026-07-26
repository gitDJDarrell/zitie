import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInterval, isDue, isScheduled, masteryLabel, masteryOf, previewIntervalDays } from "./srs.js";
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
