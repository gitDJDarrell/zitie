import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEX_LEVELS } from "../data/dex.js";
import {
  DUPE_VALUE, PACK_COST, PACK_FLOOR, PACK_SIZE, PITY_EPIC, PITY_LEGENDARY,
  POINTS, RARITY_ORDER, pointsFor, poolFor, rarityOf, ratingOf, rollPack, wordRatingOf,
} from "./packs.js";
import type { Rarity } from "./packs.js";

/** Deterministic PRNG (mulberry32) — pack rolls must be replayable in tests,
    or a floor that fails one time in fifty never gets caught. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gradeOf = (r: Rarity) => RARITY_ORDER.indexOf(r);
const tierChars = (id: string) =>
  [...(DEX_LEVELS.find(l => l.id === id)?.chars ?? "")].filter(c => c.trim());

describe("ratingOf", () => {
  it("rates every character in the dex", () => {
    for (const level of DEX_LEVELS) {
      for (const c of tierChars(level.id)) {
        assert.ok(ratingOf(c), `${c} (HSK ${level.id}) has no rating`);
      }
    }
  });

  it("files each character under its own HSK tier", () => {
    assert.equal(ratingOf("不")?.tier, "1");
    assert.equal(ratingOf("啊")?.tier, "2");
  });

  it("is stable across calls", () => {
    // A rarity that reshuffled between builds would silently restyle cards
    // the user already collected.
    const first = tierChars("3").map(c => rarityOf(c));
    const second = tierChars("3").map(c => rarityOf(c));
    assert.deepEqual(first, second);
  });

  it("returns undefined for a character outside the dex", () => {
    assert.equal(ratingOf("﨑"), undefined);
    assert.equal(rarityOf(""), undefined);
  });
});

describe("rarity distribution", () => {
  it("holds the 3/7/40/50 split within every tier", () => {
    for (const level of DEX_LEVELS) {
      const chars = tierChars(level.id);
      const n = chars.length;
      const count = (r: Rarity) => chars.filter(c => rarityOf(c) === r).length;
      const expect: [Rarity, number][] = [
        ["legendary", Math.round(n * 0.03)],
        ["epic", Math.round(n * 0.10) - Math.round(n * 0.03)],
        ["rare", Math.round(n * 0.50) - Math.round(n * 0.10)],
        ["common", n - Math.round(n * 0.50)],
      ];
      for (const [rarity, want] of expect) {
        assert.equal(count(rarity), want, `HSK ${level.id} ${rarity}`);
      }
    }
  });

  it("gives every tier its own legendaries", () => {
    // The whole point of grading within a tier: a HSK 1 learner can pull a
    // legendary and use it that afternoon.
    for (const level of DEX_LEVELS) {
      assert.ok(poolFor(level.id, "legendary").length > 0, `HSK ${level.id} has no legendary`);
    }
  });

  it("ranks legendaries above commons by yield within a tier", () => {
    for (const level of DEX_LEVELS) {
      const chars = tierChars(level.id);
      const yieldsFor = (r: Rarity) =>
        chars.filter(c => rarityOf(c) === r).map(c => ratingOf(c)!.yield);
      const lowestLegendary = Math.min(...yieldsFor("legendary"));
      const highestCommon = Math.max(...yieldsFor("common"));
      assert.ok(lowestLegendary >= highestCommon, `HSK ${level.id} rarity inverts yield`);
    }
  });

  it("makes the workhorse characters legendary, not common", () => {
    // The inversion guard. 不 appears in 206 HSK words; if a change ever
    // files it as a common, the reward structure has flipped away from the
    // learning structure and this feature is broken.
    assert.equal(rarityOf("不"), "legendary");
    assert.equal(rarityOf("人"), "legendary");
    assert.equal(rarityOf("子"), "legendary");
  });

  it("grades a character that appears in no HSK word as common", () => {
    const orphans = DEX_LEVELS.flatMap(l => tierChars(l.id)).filter(c => ratingOf(c)!.yield === 0);
    assert.ok(orphans.length > 0, "expected some zero-yield characters in the dex");
    for (const c of orphans) assert.equal(rarityOf(c), "common", `${c} has zero yield`);
  });
});

describe("wordRatingOf", () => {
  it("rates words on the same scale as characters", () => {
    const r = wordRatingOf("米饭");
    assert.ok(r);
    assert.ok(RARITY_ORDER.includes(r.rarity));
    assert.equal(r.tier, "1");
  });

  it("grades a phonetic loanword low", () => {
    // 咖 and 啡 carry no meaning alone and appear in almost nothing else, so
    // 咖啡 is not central vocabulary however familiar the drink is.
    assert.equal(gradeOf(wordRatingOf("咖啡")!.rarity) <= gradeOf("rare"), true);
  });

  it("returns undefined for a word outside the HSK list", () => {
    assert.equal(wordRatingOf("不存在的词"), undefined);
  });
});

describe("rollPack", () => {
  it("always deals a full pack", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { cards } = rollPack({ grade: "common", tier: "1", rng: seeded(seed) });
      assert.equal(cards.length, PACK_SIZE, `seed ${seed}`);
    }
  });

  it("never deals the same card twice in one pack", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { cards } = rollPack({ grade: "legendary", tier: "2", rng: seeded(seed) });
      const unique = new Set(cards.map(c => c.hanzi));
      assert.equal(unique.size, cards.length, `seed ${seed} dealt a duplicate`);
    }
  });

  it("is replayable from the same seed", () => {
    const a = rollPack({ grade: "epic", tier: "1", rng: seeded(42) });
    const b = rollPack({ grade: "epic", tier: "1", rng: seeded(42) });
    assert.deepEqual(a.cards.map(c => c.hanzi), b.cards.map(c => c.hanzi));
  });

  it("meets every grade's guaranteed floor", () => {
    for (const grade of RARITY_ORDER) {
      const floor = PACK_FLOOR[grade];
      for (let seed = 1; seed <= 40; seed++) {
        const { cards } = rollPack({ grade, tier: "3", rng: seeded(seed) });
        const met = cards.filter(c => gradeOf(c.rarity) >= gradeOf(floor.rarity)).length;
        assert.ok(met >= floor.count,
          `${grade} pack seed ${seed}: wanted ${floor.count}x ${floor.rarity}, got ${met}`);
      }
    }
  });

  it("draws only from the current tier and the one above", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { cards } = rollPack({ grade: "common", tier: "2", rng: seeded(seed) });
      for (const c of cards) {
        assert.ok(c.tier === "2" || c.tier === "3", `seed ${seed} drew from HSK ${c.tier}`);
      }
    }
  });

  it("keeps the top tier in band rather than running off the end", () => {
    const { cards } = rollPack({ grade: "common", tier: "7-9", rng: seeded(7) });
    for (const c of cards) assert.equal(c.tier, "7-9");
  });
});

describe("pity timers", () => {
  it("forces an epic on the pity pack", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { cards } = rollPack({
        grade: "common", tier: "1", rng: seeded(seed), sinceEpic: PITY_EPIC - 1,
      });
      assert.ok(cards.some(c => gradeOf(c.rarity) >= gradeOf("epic")), `seed ${seed}`);
    }
  });

  it("forces a legendary on the pity pack", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { cards } = rollPack({
        grade: "common", tier: "1", rng: seeded(seed), sinceLegendary: PITY_LEGENDARY - 1,
      });
      assert.ok(cards.some(c => c.rarity === "legendary"), `seed ${seed}`);
    }
  });

  it("resets the counter when the rarity lands", () => {
    const { sinceLegendary } = rollPack({
      grade: "legendary", tier: "1", rng: seeded(3), sinceLegendary: 11,
    });
    assert.equal(sinceLegendary, 0);
  });

  it("advances the counter when it does not", () => {
    // A common pack floors at one epic, so legendaries can legitimately miss.
    let since = 0;
    let missed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const res = rollPack({ grade: "common", tier: "1", rng: seeded(seed), sinceLegendary: since });
      if (res.sinceLegendary > since) missed++;
      since = res.sinceLegendary;
      assert.ok(since < PITY_LEGENDARY, "counter ran past the pity threshold");
    }
    assert.ok(missed > 0, "expected at least one pack without a legendary");
  });
});

describe("economy", () => {
  it("pays only for proving cards", () => {
    // Opening a pack must earn nothing, or hoarding unstudied cards becomes
    // a viable strategy and the study loop inverts.
    assert.equal(pointsFor([]), 0);
    assert.equal(pointsFor(["review"]), POINTS.review);
    assert.equal(pointsFor(["proof", "proof", "mastery"]), POINTS.proof * 2 + POINTS.mastery);
    assert.ok(!("pack" in POINTS));
  });

  it("values mastery well above a single review", () => {
    assert.ok(POINTS.mastery > POINTS.proof);
    assert.ok(POINTS.proof > POINTS.review);
  });

  it("scales duplicate value and pack cost with rarity", () => {
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      const lower = RARITY_ORDER[i - 1];
      const higher = RARITY_ORDER[i];
      assert.ok(DUPE_VALUE[higher] > DUPE_VALUE[lower], `${higher} dupe value`);
      assert.ok(PACK_COST[higher] > PACK_COST[lower], `${higher} pack cost`);
    }
  });

  it("prices a common pack within reach of a week of real study", () => {
    // Roughly six masteries, or thirty proofs. If this ever drifts far
    // enough that packs are unreachable by study, the points economy is
    // decorative and the subscription is the only route.
    const weekOfStudy = pointsFor([
      ...Array(20).fill("review"), ...Array(10).fill("proof"), ...Array(2).fill("mastery"), "streak",
    ] as never);
    assert.ok(weekOfStudy >= PACK_COST.common * 0.5,
      `a studious week earns ${weekOfStudy}, a common pack costs ${PACK_COST.common}`);
  });
});
