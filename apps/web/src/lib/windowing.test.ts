import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { columnCount, visibleRows } from "./windowing";

const GRID = { gridTop: 200, rowHeight: 80, rowCount: 100, viewportHeight: 800 };

describe("visibleRows", () => {
  it("renders from the top before the grid is scrolled to", () => {
    const { firstRow, lastRow } = visibleRows({ ...GRID, scrollTop: 0 });
    assert.equal(firstRow, 0);
    // 800px of viewport past a grid starting 200px down: 7.5 rows, plus overscan.
    assert.equal(lastRow, 11);
  });

  it("follows the viewport down the grid", () => {
    const { firstRow, lastRow } = visibleRows({ ...GRID, scrollTop: 2000 });
    assert.equal(firstRow, 19); // (2000-200)/80 = 22.5 → 22, minus 3 overscan
    assert.equal(lastRow, 36);  // (1800+800)/80 = 32.5 → 33, plus 3 overscan
  });

  it("clamps to the last row when scrolled past the end", () => {
    const { firstRow, lastRow } = visibleRows({ ...GRID, scrollTop: 100_000 });
    assert.equal(lastRow, 99);
    assert.ok(firstRow <= lastRow);
  });

  it("keeps overscan rows on both sides", () => {
    const tight = visibleRows({ ...GRID, scrollTop: 2000, overscan: 0 });
    const loose = visibleRows({ ...GRID, scrollTop: 2000, overscan: 5 });
    assert.equal(loose.firstRow, tight.firstRow - 5);
    assert.equal(loose.lastRow, tight.lastRow + 5);
  });

  it("renders nothing for an empty grid", () => {
    assert.deepEqual(visibleRows({ ...GRID, rowCount: 0, scrollTop: 0 }), { firstRow: 0, lastRow: -1 });
  });

  it("survives a zero row height rather than dividing by it", () => {
    assert.deepEqual(visibleRows({ ...GRID, rowHeight: 0, scrollTop: 0 }), { firstRow: 0, lastRow: -1 });
  });

  it("never returns a range wider than the grid", () => {
    for (const scrollTop of [0, 500, 5_000, 50_000]) {
      const { firstRow, lastRow } = visibleRows({ ...GRID, scrollTop });
      assert.ok(firstRow >= 0 && lastRow <= GRID.rowCount - 1, `${firstRow}..${lastRow}`);
    }
  });
});

describe("columnCount", () => {
  it("fits as many tiles as the width allows", () => {
    assert.equal(columnCount(400, 92, 4), 4);   // 4×92 + 3×4 = 380 ≤ 400
    assert.equal(columnCount(1000, 92, 4), 10);
  });

  it("never drops below one column", () => {
    assert.equal(columnCount(50, 92, 4), 1);
    assert.equal(columnCount(0, 92, 4), 1);
  });
});
