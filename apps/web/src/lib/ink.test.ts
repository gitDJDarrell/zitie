import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bristles, DEFAULT_INK, rng, speedProfile, strokeOutline, widthProfile,
  type InkParams, type SamplePoint,
} from "./ink.js";

/** A stroke drawn left to right at a constant rate. */
function steady(n = 12, msPerStep = 16): SamplePoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 100, t: i * msPerStep }));
}

describe("rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = rng(7), b = rng(7);
    for (let i = 0; i < 5; i++) assert.equal(a(), b());
  });

  it("gives different sequences for different seeds", () => {
    assert.notEqual(rng(7)(), rng(8)());
  });

  it("stays in [0, 1)", () => {
    const r = rng(42);
    for (let i = 0; i < 500; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `${v} out of range`);
    }
  });
});

describe("speedProfile", () => {
  it("is roughly flat for a stroke drawn at a constant rate", () => {
    const speeds = speedProfile(steady());
    const mid = speeds.slice(2, -2);
    for (const s of mid) assert.ok(Math.abs(s - mid[0]) < 0.01, `${s} vs ${mid[0]}`);
  });

  it("reads a fast stroke as faster than a slow one", () => {
    const slow = speedProfile(steady(12, 60));
    const fast = speedProfile(steady(12, 8));
    assert.ok(Math.max(...fast) > Math.max(...slow) * 3);
  });

  it("handles a single point without dividing by zero", () => {
    assert.deepEqual(speedProfile([{ x: 1, y: 1, t: 0 }]), [0]);
    assert.deepEqual(speedProfile([]), []);
  });
});

describe("widthProfile", () => {
  const scale = 320;

  it("tapers at both ends and is fattest in the body", () => {
    const w = widthProfile(steady(20), { ...DEFAULT_INK, speed: 0 }, scale);
    const body = Math.max(...w);
    assert.ok(w[0] < body, "starts thinner than the body");
    assert.ok(w[w.length - 1] < body, "ends thinner than the body");
    // The lift is the sharper of the two — that's the brush leaving the paper.
    assert.ok(w[w.length - 1] < w[0], "the tail is finer than the landing");
  });

  it("scales with weight", () => {
    const light = widthProfile(steady(), { ...DEFAULT_INK, weight: 0.1 }, scale);
    const heavy = widthProfile(steady(), { ...DEFAULT_INK, weight: 0.9 }, scale);
    assert.ok(Math.max(...heavy) > Math.max(...light) * 1.5);
  });

  it("thins a fast stroke when speed sensitivity is up, and not when it's off", () => {
    const params = (speed: number): InkParams => ({ ...DEFAULT_INK, speed, formality: 1 });
    // Same gesture, one sensitive to speed and one not: a stroke that
    // accelerates should narrow only in the sensitive one.
    const accelerating: SamplePoint[] = Array.from({ length: 14 }, (_, i) => ({
      x: i * i * 3, y: 100, t: i * 16,
    }));
    const sensitive = widthProfile(accelerating, params(1), scale);
    const flat = widthProfile(accelerating, params(0), scale);
    const ratio = (w: number[]) => w[Math.floor(w.length / 2)] / Math.max(...w);
    assert.ok(ratio(sensitive) < ratio(flat), "speed should narrow the line");
  });

  it("never goes to zero, so a stroke is always visible", () => {
    for (const speed of [0, 0.5, 1]) {
      for (const w of widthProfile(steady(30, 2), { ...DEFAULT_INK, speed }, scale)) {
        assert.ok(w > 0, `width ${w}`);
      }
    }
  });

  it("is stable across renders — the same input gives the same widths", () => {
    const a = widthProfile(steady(), DEFAULT_INK, scale);
    const b = widthProfile(steady(), DEFAULT_INK, scale);
    assert.deepEqual(a, b);
  });

  it("varies more in a loose hand than a formal one", () => {
    const spread = (formality: number) => {
      const w = widthProfile(steady(24), { ...DEFAULT_INK, formality, speed: 0 }, scale);
      const body = w.slice(4, -8);
      return Math.max(...body) - Math.min(...body);
    };
    assert.ok(spread(0) > spread(1), "a loose hand should wander more");
  });
});

describe("strokeOutline", () => {
  it("closes the outline: one point per side, per sample", () => {
    const points = steady(10);
    const outline = strokeOutline(points, widthProfile(points, DEFAULT_INK, 320));
    assert.equal(outline.length, 20);
  });

  it("puts the two sides on opposite sides of the centreline", () => {
    const points = steady(10);
    const widths = widthProfile(points, DEFAULT_INK, 320);
    const outline = strokeOutline(points, widths);
    // Horizontal stroke: the first half should sit above the line, the mirrored
    // second half below (or the reverse) — never both on the same side.
    const first = outline[5][1] - 100;
    const mirrored = outline[outline.length - 6][1] - 100;
    assert.ok(first * mirrored < 0, `${first} and ${mirrored} should straddle the centreline`);
  });

  it("renders a tap as a dot rather than nothing", () => {
    const outline = strokeOutline([{ x: 50, y: 50, t: 0 }], [4]);
    assert.ok(outline.length >= 8, "a dot needs enough points to look round");
    for (const [x, y] of outline) {
      assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - 4) < 0.001, "on the circle");
    }
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(strokeOutline([], []), []);
  });
});

describe("bristles", () => {
  const fast: SamplePoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: i * i * 4, y: 100, t: i * 8,     // accelerating away at the tail
  }));

  it("appear on a dry brush", () => {
    const dry = { ...DEFAULT_INK, wetness: 0, formality: 0 };
    assert.ok(bristles(fast, widthProfile(fast, dry, 320), dry).length > 0);
  });

  it("do not appear on a wet one — the ink closes over", () => {
    const wet = { ...DEFAULT_INK, wetness: 1, formality: 0 };
    assert.equal(bristles(fast, widthProfile(fast, wet, 320), wet).length, 0);
  });

  it("are suppressed by a formal hand", () => {
    const count = (formality: number) => {
      const ink = { ...DEFAULT_INK, wetness: 0.1, formality };
      return bristles(fast, widthProfile(fast, ink, 320), ink).length;
    };
    assert.ok(count(1) <= count(0), `formal ${count(1)} vs loose ${count(0)}`);
  });

  it("trail off the end of the stroke, not the start", () => {
    const ink = { ...DEFAULT_INK, wetness: 0, formality: 0 };
    const hairs = bristles(fast, widthProfile(fast, ink, 320), ink);
    const tail = fast[fast.length - 1];
    for (const h of hairs) {
      assert.ok(Math.hypot(h.from[0] - tail.x, h.from[1] - tail.y) < 60, "starts at the tip");
      assert.ok(h.to[0] > h.from[0], "points onward, the way the stroke was going");
    }
  });

  it("are reproducible for a given seed", () => {
    const ink = { ...DEFAULT_INK, wetness: 0, formality: 0 };
    const widths = widthProfile(fast, ink, 320);
    assert.deepEqual(bristles(fast, widths, ink), bristles(fast, widths, ink));
  });

  it("stay away from a stroke too short to have a tail", () => {
    assert.deepEqual(bristles([{ x: 0, y: 0, t: 0 }], [3], DEFAULT_INK), []);
  });
});
