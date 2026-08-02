import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bristles, DEFAULT_INK, flyingWhite, inkColor, rng, speedProfile, strokeOutline,
  tonProfile, travel, widthProfile, type InkParams, type SamplePoint,
} from "./ink.js";

/** A stroke drawn left to right at a constant rate. */
function steady(n = 12, msPerStep = 16): SamplePoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 100, t: i * msPerStep }));
}

/** A stroke that accelerates away — the shape that goes dry at the tail. */
function accelerating(n = 14): SamplePoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * i * 3, y: 100, t: i * 16 }));
}

const ink = (over: Partial<InkParams> = {}): InkParams => ({ ...DEFAULT_INK, ...over });

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
    assert.ok(Math.max(...speedProfile(steady(12, 8))) > Math.max(...speedProfile(steady(12, 60))) * 3);
  });

  it("handles a single point without dividing by zero", () => {
    assert.deepEqual(speedProfile([{ x: 1, y: 1, t: 0 }]), [0]);
    assert.deepEqual(speedProfile([]), []);
  });
});

describe("travel", () => {
  it("runs 0 to 1 along the stroke", () => {
    const along = travel(steady());
    assert.equal(along[0], 0);
    assert.equal(along[along.length - 1], 1);
  });

  it("is proportional to distance, not to sample count", () => {
    // Samples bunched at the start: the halfway *point* is not the halfway
    // *sample*, and depletion has to follow the distance.
    const bunched: SamplePoint[] = [
      { x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 8 }, { x: 2, y: 0, t: 16 }, { x: 100, y: 0, t: 40 },
    ];
    const along = travel(bunched);
    assert.ok(along[2] < 0.05, `third sample is barely along the stroke: ${along[2]}`);
  });

  it("survives a stroke that never moved", () => {
    assert.deepEqual(travel([{ x: 5, y: 5, t: 0 }, { x: 5, y: 5, t: 9 }]), [0, 0]);
  });
});

describe("widthProfile — 提按 lift and press", () => {
  const scale = 320;

  it("tapers at both ends and is fattest in the body", () => {
    const w = widthProfile(steady(20), ink({ pressure: 0 }), scale);
    const body = Math.max(...w);
    assert.ok(w[0] < body, "starts thinner than the body");
    assert.ok(w[w.length - 1] < body, "ends thinner than the body");
    assert.ok(w[w.length - 1] < w[0], "the tail is finer than the landing");
  });

  it("scales with weight", () => {
    const light = widthProfile(steady(), ink({ weight: 0.1 }), scale);
    const heavy = widthProfile(steady(), ink({ weight: 0.9 }), scale);
    assert.ok(Math.max(...heavy) > Math.max(...light) * 1.5);
  });

  it("makes the line answer speed only when pressure is up", () => {
    const ratio = (p: number) => {
      const w = widthProfile(accelerating(), ink({ pressure: p }), scale);
      return w[Math.floor(w.length / 2)] / Math.max(...w);
    };
    assert.ok(ratio(1) < ratio(0), "a pressed hand should swell and narrow");
  });

  it("swells with a wetter brush", () => {
    const dry = Math.max(...widthProfile(steady(), ink({ water: 0 }), scale));
    const wet = Math.max(...widthProfile(steady(), ink({ water: 1 }), scale));
    assert.ok(wet > dry, `${wet} should exceed ${dry}`);
  });

  it("never goes to zero, so a stroke is always visible", () => {
    for (const pressure of [0, 0.5, 1]) {
      for (const w of widthProfile(steady(30, 2), ink({ pressure }), scale)) {
        assert.ok(w > 0, `width ${w}`);
      }
    }
  });

  it("is stable across renders", () => {
    assert.deepEqual(widthProfile(steady(), DEFAULT_INK, scale), widthProfile(steady(), DEFAULT_INK, scale));
  });
});

describe("tonProfile — 濃 how dark, and how it runs out", () => {
  it("tops out at the ink's density", () => {
    for (const density of [0.2, 0.6, 1]) {
      const tones = tonProfile(steady(), ink({ density, water: 1, pressure: 0 }));
      assert.ok(Math.max(...tones) <= density + 1e-9, `${Math.max(...tones)} exceeds ${density}`);
    }
  });

  it("fades along a dry stroke — the brush spends what it carries", () => {
    const tones = tonProfile(steady(20), ink({ water: 0, pressure: 0 }));
    assert.ok(tones[tones.length - 1] < tones[0] * 0.8,
      `tail ${tones[tones.length - 1]} should be well under head ${tones[0]}`);
  });

  it("holds its tone when the brush is loaded with water", () => {
    const tones = tonProfile(steady(20), ink({ water: 1, pressure: 0 }));
    assert.ok(tones[tones.length - 1] > tones[0] * 0.95, "a wet brush lays an even tone");
  });

  it("stays visible however dry and fast", () => {
    for (const t of tonProfile(accelerating(), ink({ density: 0.1, water: 0, pressure: 1 }))) {
      assert.ok(t >= 0.06, `tone ${t} would be invisible`);
    }
  });
});

describe("flyingWhite — 飛白 the dry streaks", () => {
  it("appears on a fast dry brush", () => {
    assert.ok(flyingWhite(accelerating(), ink({ water: 0, flyingWhite: 1 })).length > 0);
  });

  it("is closed up by water", () => {
    assert.equal(flyingWhite(accelerating(), ink({ water: 1, flyingWhite: 1 })).length, 0);
  });

  it("is off when the control is off, however dry the stroke", () => {
    assert.deepEqual(flyingWhite(accelerating(), ink({ water: 0, flyingWhite: 0 })), []);
  });

  it("gives more of it as the control goes up", () => {
    const count = (f: number) => flyingWhite(accelerating(), ink({ water: 0, flyingWhite: f })).length;
    assert.ok(count(1) >= count(0.3), `${count(1)} vs ${count(0.3)}`);
  });

  it("keeps every streak inside the stroke", () => {
    for (const s of flyingWhite(accelerating(), ink({ water: 0, flyingWhite: 1 }))) {
      assert.ok(s.from >= 0 && s.to <= 1 && s.from < s.to, `streak ${s.from}–${s.to}`);
      assert.ok(Math.abs(s.offset) <= 1, `offset ${s.offset} outside the stroke`);
      assert.ok(s.width > 0 && s.width <= 0.7, `width ${s.width}`);
    }
  });

  it("is reproducible for a given seed", () => {
    const p = ink({ water: 0, flyingWhite: 0.8 });
    assert.deepEqual(flyingWhite(accelerating(), p), flyingWhite(accelerating(), p));
  });

  it("leaves a stroke too short to go dry alone", () => {
    assert.deepEqual(flyingWhite([{ x: 0, y: 0, t: 0 }], ink({ flyingWhite: 1 })), []);
  });
});

describe("strokeOutline — 側鋒 the tilt of the tip", () => {
  it("closes the outline: one point per side, per sample", () => {
    const points = steady(10);
    assert.equal(strokeOutline(points, widthProfile(points, DEFAULT_INK, 320)).length, 20);
  });

  it("puts the two sides on opposite sides of the centreline", () => {
    const points = steady(10);
    const outline = strokeOutline(points, widthProfile(points, DEFAULT_INK, 320));
    const first = outline[5][1] - 100;
    const mirrored = outline[outline.length - 6][1] - 100;
    assert.ok(first * mirrored < 0, `${first} and ${mirrored} should straddle the centreline`);
  });

  it("is symmetric with the brush held upright", () => {
    const points = steady(10);
    const widths = widthProfile(points, DEFAULT_INK, 320);
    const outline = strokeOutline(points, widths, 0);
    const above = Math.abs(outline[5][1] - 100);
    const below = Math.abs(outline[outline.length - 6][1] - 100);
    assert.ok(Math.abs(above - below) < 0.001, `${above} vs ${below}`);
  });

  it("runs one flank heavier when the brush is tilted", () => {
    const points = steady(10);
    const widths = widthProfile(points, DEFAULT_INK, 320);
    const outline = strokeOutline(points, widths, 1);
    const above = Math.abs(outline[5][1] - 100);
    const below = Math.abs(outline[outline.length - 6][1] - 100);
    assert.ok(above > below * 1.3, `tilted: ${above} should ride well above ${below}`);
  });

  it("renders a tap as a dot rather than nothing", () => {
    const outline = strokeOutline([{ x: 50, y: 50, t: 0 }], [4]);
    assert.ok(outline.length >= 8);
    for (const [x, y] of outline) {
      assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - 4) < 0.001, "on the circle");
    }
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(strokeOutline([], []), []);
  });
});

describe("bristles", () => {
  it("appear on a dry brush and not a wet one", () => {
    const dry = ink({ water: 0, flyingWhite: 1 });
    const wet = ink({ water: 1, flyingWhite: 1 });
    assert.ok(bristles(accelerating(), widthProfile(accelerating(), dry, 320), dry).length > 0);
    assert.equal(bristles(accelerating(), widthProfile(accelerating(), wet, 320), wet).length, 0);
  });

  it("trail off the end of the stroke, not the start", () => {
    const p = ink({ water: 0, flyingWhite: 1 });
    const tail = accelerating()[accelerating().length - 1];
    for (const h of bristles(accelerating(), widthProfile(accelerating(), p, 320), p)) {
      assert.ok(Math.hypot(h.from[0] - tail.x, h.from[1] - tail.y) < 60, "starts at the tip");
      assert.ok(h.to[0] > h.from[0], "points onward");
    }
  });

  it("stay away from a stroke too short to have a tail", () => {
    assert.deepEqual(bristles([{ x: 0, y: 0, t: 0 }], [3], DEFAULT_INK), []);
  });
});

describe("inkColor", () => {
  it("darkens as the tone rises", () => {
    const value = (s: string) => Number(s.match(/\d+/)![0]);
    assert.ok(value(inkColor(1)) < value(inkColor(0.5)));
    assert.ok(value(inkColor(0.5)) < value(inkColor(0)));
  });

  it("is never pure black — ground ink is warm", () => {
    const [r, g, b] = inkColor(1).match(/\d+/g)!.map(Number);
    assert.ok(r > 0 && r >= b, "warm: red at least matches blue");
    assert.ok(r > 15, "not crushed to black");
  });

  it("clamps rather than producing nonsense", () => {
    for (const t of [-5, 0, 1, 9]) {
      const parts = inkColor(t).match(/\d+/g)!.map(Number);
      for (const c of parts) assert.ok(c >= 0 && c <= 255, `${c} out of range for tone ${t}`);
    }
  });
});
