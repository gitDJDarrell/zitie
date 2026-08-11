import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RANKS, RATING_BASE, rankFor } from "./rank.js";

describe("rankFor", () => {
  it("starts a fresh account at 童生", () => {
    assert.equal(rankFor(RATING_BASE).rank.zh, "童生");
  });

  it("lands exactly on a band's floor", () => {
    for (const r of RANKS) assert.equal(rankFor(r.min).rank.zh, r.zh);
  });

  it("tops out at 状元 with no next rank", () => {
    const top = RANKS[RANKS.length - 1];
    const s = rankFor(top.min + 500);
    assert.equal(s.rank.zh, "状元");
    assert.equal(s.next, null);
    assert.equal(s.progress, 1);
    assert.equal(s.toNext, 0);
  });

  it("never lowers the rank as the rating climbs", () => {
    let last = -1;
    for (let r = 0; r <= 2000; r += 25) {
      const idx = RANKS.indexOf(rankFor(r).rank);
      assert.ok(idx >= last, `rank dropped at ${r}`);
      last = idx;
    }
  });

  it("reports progress in [0,1] and a shrinking gap to the next rank", () => {
    const a = rankFor(1085); // just into 秀才
    const b = rankFor(1150); // near the top of 秀才
    assert.ok(a.progress >= 0 && a.progress <= 1);
    assert.equal(a.rank.zh, "秀才");
    assert.ok(b.toNext < a.toNext, "gap to next rank should shrink as rating rises within a band");
  });
});
