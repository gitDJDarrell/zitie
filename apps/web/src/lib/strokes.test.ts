import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GLYPH_BASELINE, GLYPH_DESCENT, glyphCanvasTransform,
  gradeAttempt, matchStrokes, pathLength, resample, strokeDistance,
  toCanvasSpace, toGlyphSpace, type Point,
} from "./strokes.js";

/** A straight line from a to b, sampled unevenly on purpose. */
function line(a: Point, b: Point, n = 5): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) ** 1.5;   // bunched at one end, like a real drag
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point;
  });
}

describe("resample", () => {
  it("returns exactly the requested number of points", () => {
    assert.equal(resample(line([0, 0], [100, 0]), 16).length, 16);
    assert.equal(resample(line([0, 0], [100, 0], 40), 8).length, 8);
  });

  it("keeps the endpoints", () => {
    const out = resample(line([10, 20], [90, 60]), 12);
    assert.deepEqual(out[0], [10, 20]);
    assert.deepEqual(out[out.length - 1], [90, 60]);
  });

  it("spaces points evenly along the path, however unevenly it was sampled", () => {
    const out = resample(line([0, 0], [100, 0], 40), 11);
    for (let i = 0; i < out.length; i++) {
      assert.ok(Math.abs(out[i][0] - i * 10) < 0.5, `point ${i} at ${out[i][0]}`);
    }
  });

  it("survives degenerate input", () => {
    assert.deepEqual(resample([], 4), []);
    assert.equal(resample([[5, 5]], 4).length, 4);
    // A tap: every point identical, zero length.
    assert.equal(resample([[5, 5], [5, 5], [5, 5]], 6).length, 6);
  });
});

describe("strokeDistance", () => {
  const median: Point[] = [[100, 500], [500, 500], [900, 500]];

  it("is ~0 for the same stroke", () => {
    assert.ok(strokeDistance(median, median) < 0.001);
  });

  it("grows with how far off the stroke is", () => {
    const near = strokeDistance([[100, 520], [900, 520]], median);
    const far = strokeDistance([[100, 900], [900, 900]], median);
    assert.ok(near < far, `${near} should be < ${far}`);
    assert.ok(near < 0.05, `a 20-unit offset should be close: ${near}`);
  });

  it("penalises a stroke drawn backwards", () => {
    // Same shape, opposite direction — a real error, since stroke direction is
    // part of what's being taught.
    const backwards = strokeDistance([[900, 500], [100, 500]], median);
    assert.ok(backwards > 0.2, `backwards should score badly: ${backwards}`);
  });
});

describe("matchStrokes", () => {
  const medians: Point[][] = [
    [[100, 800], [900, 800]],   // 0: top horizontal
    [[500, 800], [500, 100]],   // 1: vertical
    [[100, 200], [900, 200]],   // 2: bottom horizontal
  ];

  it("pairs each drawn stroke with the one it was aiming at", () => {
    const drawn: Point[][] = [
      [[110, 790], [880, 810]],
      [[505, 790], [495, 120]],
    ];
    assert.deepEqual(matchStrokes(drawn, medians).map((m) => m.target), [0, 1]);
  });

  it("matches by shape, not by the order they were drawn", () => {
    const drawn: Point[][] = [
      [[100, 200], [900, 200]],   // the bottom one, drawn first
      [[100, 800], [900, 800]],
    ];
    assert.deepEqual(matchStrokes(drawn, medians).map((m) => m.target), [2, 0]);
  });

  it("refuses to match a stroke that isn't in the character", () => {
    const drawn: Point[][] = [[[100, 500], [200, 450]]];   // a short stray mark
    assert.equal(matchStrokes(drawn, medians)[0].target, null);
  });

  it("never claims one target twice", () => {
    const twice: Point[][] = [
      [[100, 800], [900, 800]],
      [[100, 800], [900, 800]],   // the same stroke again
    ];
    const targets = matchStrokes(twice, medians).map((m) => m.target);
    assert.equal(targets[0], 0);
    assert.notEqual(targets[1], 0);
  });
});

describe("gradeAttempt", () => {
  const medians: Point[][] = [
    [[100, 800], [900, 800]],
    [[500, 800], [500, 100]],
    [[100, 200], [900, 200]],
  ];

  it("calls a complete, in-order attempt perfect", () => {
    const v = gradeAttempt(medians, medians);
    assert.equal(v.perfect, true);
    assert.equal(v.complete, true);
    assert.equal(v.orderOk, true);
    assert.equal(v.matched, 3);
    assert.deepEqual(v.missing, []);
  });

  it("accepts a complete attempt written in the wrong order, but flags it", () => {
    // Every stroke present, sequence wrong — the case the recording shows
    // ("written in a different stroke order · show me").
    const v = gradeAttempt([medians[2], medians[0], medians[1]], medians);
    assert.equal(v.complete, true, "all three strokes are there");
    assert.equal(v.orderOk, false, "but not in order");
    assert.equal(v.perfect, false);
  });

  it("reports which strokes were never drawn", () => {
    const v = gradeAttempt([medians[0]], medians);
    assert.equal(v.complete, false);
    assert.deepEqual(v.missing, [1, 2]);
    assert.equal(v.matched, 1);
  });

  it("counts strokes that matched nothing", () => {
    const v = gradeAttempt([...medians, [[10, 10], [30, 20]]], medians);
    assert.equal(v.complete, true);
    assert.equal(v.stray, 1);
    assert.equal(v.perfect, false, "a spurious mark isn't perfect");
  });

  it("treats a character with no stroke data as ungradeable, not as passed", () => {
    const v = gradeAttempt([[[0, 0], [100, 100]]], []);
    assert.equal(v.complete, false);
    assert.equal(v.expected, 0);
  });
});

describe("coordinate spaces", () => {
  it("round-trips a point through glyph space and back", () => {
    const size = 320;
    const original: Point[] = [[40, 60], [280, 300]];
    const back = toCanvasSpace(toGlyphSpace(original, size), size);
    for (let i = 0; i < original.length; i++) {
      assert.ok(Math.abs(back[i][0] - original[i][0]) < 0.001, `x ${back[i][0]}`);
      assert.ok(Math.abs(back[i][1] - original[i][1]) < 0.001, `y ${back[i][1]}`);
    }
  });

  it("puts the top of the canvas at the top of the glyph", () => {
    // Canvas y grows downward, glyph y grows upward — a stroke drawn near the
    // top of the pad must not come out at the bottom of the character.
    const [[, highY]] = toGlyphSpace([[100, 10]], 320);
    const [[, lowY]] = toGlyphSpace([[100, 310]], 320);
    assert.ok(highY > lowY, `top of canvas (${highY}) should exceed bottom (${lowY})`);
  });

  /**
   * The traced outline and the graded medians have to land in the same place.
   * They didn't: the canvas transform was hand-written with the descent applied
   * after the y flip, so the outline sat 248 units — a quarter of the pad —
   * below the strokes being matched. Tracing exactly what was on screen scored
   * 0.242 against a 0.18 tolerance, so every stroke read "unrecognised" and the
   * numbered stroke order floated above the character it belonged to.
   */
  it("draws the target glyph where the medians are graded", () => {
    for (const size of [220, 320, 420]) {
      const { ty, sx, sy } = glyphCanvasTransform(size);
      // Apply the transform the way canvas does: translate, then scale.
      const viaTransform = ([x, y]: Point): Point => [x * sx, y * sy + ty];

      for (const p of [[0, 0], [512, 450], [1024, GLYPH_BASELINE], [300, -GLYPH_DESCENT]] as Point[]) {
        const [want] = toCanvasSpace([p], size);
        const got = viaTransform(p);
        assert.ok(Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9,
          `size ${size}, glyph point ${p}: transform gave ${got}, toCanvasSpace gives ${want}`);
      }
    }
  });

  /**
   * The property a learner actually cares about: if you trace the outline the
   * pad shows you, it counts. This is the end-to-end version of the check
   * above — canvas projection out, grading projection back — and it is what
   * silently broke, turning a careful trace into "8 unrecognised".
   */
  it("scores a trace of the drawn outline as a match", () => {
    const size = 320;
    const medians: Point[][] = [
      [[200, 700], [200, 300]],
      [[150, 500], [600, 500]],
      [[300, 800], [700, 200]],
    ];
    // Draw exactly where the pad renders the target, then grade it.
    const drawn = medians.map(m => toGlyphSpace(toCanvasSpace(m, size), size));
    const v = gradeAttempt(drawn, medians);

    assert.equal(v.complete, true, "a perfect trace must be complete");
    assert.equal(v.stray, 0, "a perfect trace must leave nothing unrecognised");
    for (const m of v.matches) {
      assert.ok(m.distance < 1e-9, `expected a near-zero distance, got ${m.distance}`);
    }
  });

  it("keeps the glyph box inside the pad", () => {
    const size = 320;
    // Baseline at the top edge, full descent at the bottom edge.
    const [[, atBaseline]] = toCanvasSpace([[0, GLYPH_BASELINE]], size);
    const [[, atDescent]] = toCanvasSpace([[0, -GLYPH_DESCENT]], size);
    assert.equal(atBaseline, 0);
    assert.equal(atDescent, size);
  });
});

describe("pathLength", () => {
  it("measures the drawn distance, not the straight line", () => {
    assert.equal(pathLength([[0, 0], [30, 40]]), 50);
    assert.equal(pathLength([[0, 0], [10, 0], [10, 10]]), 20);
    assert.equal(pathLength([[5, 5]]), 0);
  });
});
