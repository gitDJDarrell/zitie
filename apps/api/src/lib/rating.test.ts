import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIR_OPPONENT, NEUTRAL_OPPONENT, RATING_BASE, RATING_FLOOR, expectedScore, nextRating } from "./rating.js";

describe("expectedScore", () => {
  it("is 0.5 against an equal opponent", () => {
    assert.equal(expectedScore(1200, 1200), 0.5);
  });
  it("rises above 0.5 against a weaker opponent, below against a stronger one", () => {
    assert.ok(expectedScore(1400, 1200) > 0.5);
    assert.ok(expectedScore(1000, 1200) < 0.5);
  });
});

describe("nextRating", () => {
  it("a win raises the rating, a loss lowers it", () => {
    assert.ok(nextRating(RATING_BASE, NEUTRAL_OPPONENT, true) > RATING_BASE);
    assert.ok(nextRating(RATING_BASE, NEUTRAL_OPPONENT, false) < RATING_BASE);
  });

  it("never sinks below the floor", () => {
    assert.ok(nextRating(RATING_FLOOR, DIR_OPPONENT.brush, false) >= RATING_FLOOR);
    assert.ok(nextRating(RATING_FLOOR + 5, DIR_OPPONENT.brush, false) >= RATING_FLOOR);
  });

  it("rewards a harder direction more for the same win", () => {
    const easy = nextRating(1200, DIR_OPPONENT.read, true) - 1200;
    const hard = nextRating(1200, DIR_OPPONENT.brush, true) - 1200;
    assert.ok(hard > easy, "beating the brush opponent should gain more than the read one");
  });

  it("gains less from an easy win once you're already highly rated (Elo convergence)", () => {
    const early = nextRating(1000, DIR_OPPONENT.read, true) - 1000;
    const late = nextRating(1500, DIR_OPPONENT.read, true) - 1500;
    assert.ok(late < early, "a strong player gains little from an easy opponent");
  });

  it("returns whole numbers", () => {
    const r = nextRating(1234, DIR_OPPONENT.write, true);
    assert.equal(r, Math.round(r));
  });
});
