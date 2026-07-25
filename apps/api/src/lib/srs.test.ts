import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialState, schedule, type SrsState } from "./srs.js";

const NOW = new Date("2026-07-24T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(due: Date | null) {
  assert.ok(due, "expected a due date");
  return (due.getTime() - NOW.getTime()) / DAY_MS;
}

/** A card that has stuck: several successful reps at a 10-day interval. */
function mature(over: Partial<SrsState> = {}): SrsState {
  return { ease: 2.5, intervalDays: 10, due: NOW, reps: 4, lapses: 0, ...over };
}

describe("schedule", () => {
  it("steps a new card 1d on good, 3d on easy", () => {
    assert.equal(daysUntil(schedule(initialState(), "good", NOW).due), 1);
    assert.equal(daysUntil(schedule(initialState(), "easy", NOW).due), 3);
  });

  it("uses the fixed 1d/3d ladder before the ease curve kicks in", () => {
    const first = schedule(initialState(), "good", NOW);
    assert.equal(first.reps, 1);
    const second = schedule(first, "good", NOW);
    assert.equal(daysUntil(second.due), 3); // fixed step, not 1 * 2.5
    const third = schedule(second, "good", NOW);
    assert.equal(daysUntil(third.due), 3 * 2.5); // now the curve applies
  });

  it("brings 'again' back within the session and resets reps", () => {
    const s = schedule(mature(), "again", NOW);
    assert.ok(daysUntil(s.due) < 1 / 24, "should be due in minutes, not days");
    assert.equal(s.reps, 0);
  });

  it("counts a lapse only when the card had previously stuck", () => {
    assert.equal(schedule(mature(), "again", NOW).lapses, 1);
    assert.equal(schedule(initialState(), "again", NOW).lapses, 0);
  });

  it("moves ease down on again/hard and up on easy", () => {
    assert.ok(schedule(mature(), "again", NOW).ease < 2.5);
    assert.ok(schedule(mature(), "hard", NOW).ease < 2.5);
    assert.equal(schedule(mature(), "good", NOW).ease, 2.5); // good is neutral
    assert.ok(schedule(mature(), "easy", NOW).ease > 2.5);
  });

  it("clamps ease to [1.3, 3.0] under repeated grading", () => {
    let s = mature();
    for (let i = 0; i < 20; i++) s = schedule(s, "again", NOW);
    assert.equal(s.ease, 1.3);

    s = mature();
    for (let i = 0; i < 20; i++) s = schedule(s, "easy", NOW);
    assert.equal(s.ease, 3.0);
  });

  it("caps the interval at a year no matter how long the streak", () => {
    let s = mature();
    for (let i = 0; i < 40; i++) s = schedule(s, "easy", NOW);
    assert.equal(s.intervalDays, 365);
  });

  it("keeps hard above the previous interval but below good", () => {
    const hard = schedule(mature(), "hard", NOW);
    const good = schedule(mature(), "good", NOW);
    assert.ok(hard.intervalDays > 10, "hard should still advance");
    assert.ok(hard.intervalDays < good.intervalDays);
  });
});
