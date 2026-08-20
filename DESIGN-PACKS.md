# Card packs — rating system and pack economy

Status: **core built 2026-08-19.** Written against decision 0.5.

Built and verified end to end: rating, server-side rolls with floors and pity,
the wallet (points, packs, tier, band), points minted on graded proofs, the
four material treatments, the pack-opening view, the grandfathering of 232
pre-pack cards, and the removal of import.

Not built: billing behind the subscription switch (changing tier is free), the
streak bonus, word rarity in the UI (`wordRatingOf` exists and is tested but
nothing renders it), and rarity in the Browse list.

**One collision resolved during the build.** `.dex-shiny` already meant
*mastered*. Reusing it for *legendary* would have made a mastered common
indistinguishable from an unmastered legendary, so the two signals were split:
the card's **material is its rarity** (what it is) and the **精 seal is
mastery** (what you did). Mastered cards therefore no longer turn foil on
their own. Worth a look — it changes an existing reward.

---

## 0. The problem this has to solve

Pokémon works because Charizard is rare *and* powerful. The chase card is the
one you want on the table.

Chinese characters run the other way. Measured as the number of HSK 3.0 words
each character appears in — the closest thing we have to "power level":

| HSK level | mean words per character |
|-----------|--------------------------|
| HSK 1     | 23.4 |
| HSK 2     | 15.7 |
| HSK 3     | 12.1 |
| HSK 4     | 6.9  |
| HSK 5     | 4.1  |
| HSK 6     | 4.0  |
| HSK 7-9   | 1.6  |

Top yields: 不 (206), 人 (142), 子 (139), 一 (126), 大 (111), 心 (102).
29 of the 3,000 dex characters appear in **no** HSK word at all.

So "legendary = high HSK level" makes the rarest, most celebrated pull the
*least* useful card the app can hand you, and buries the characters that
actually unlock reading in the commons pile. The reward structure would invert
the learning structure.

**The fix: rarity and difficulty are two different axes.** A card has both.

---

## 1. The rating system

Every card item — 3,000 characters and 10,954 words — is rated on two
independent axes. Both are computed from data already in the repo. No new
data sources, no external API.

### Axis A — TIER (content difficulty)

Straight from HSK level. Determines which pool a card is drawn from and
whether the learner is ready for it.

| Tier | Source | Characters | Words |
|------|--------|-----------:|------:|
| I    | HSK 1  | 300 | 505 |
| II   | HSK 2  | 300 | 749 |
| III  | HSK 3  | 300 | 949 |
| IV   | HSK 4  | 300 | 973 |
| V    | HSK 5  | 300 | 1057 |
| VI   | HSK 6  | 300 | 1119 |
| VII  | HSK 7-9 | 1200 | 5602 |

### Axis B — RARITY (card prestige)

Four grades, canonical TCG order: **Common < Rare < Epic < Legendary.**
(Your list said "common, rare, legendary, epic" — I've used the standard
order, where legendary is the top grade. Say if you meant otherwise.)

Rarity is computed from **yield percentile within the card's own tier**, not
across the whole dex:

| Rarity | Yield percentile within tier | Share of tier |
|--------|------------------------------|--------------:|
| Common    | below 50th | 50% |
| Rare      | 50th–90th  | 40% |
| Epic      | 90th–97th  | 7%  |
| Legendary | top 3%     | 3%  |

Computing within-tier is what makes this work. **Every tier has its own
legendaries.** A HSK 1 learner can pull a legendary — 不, 人, 一 — and it is
a card they can use that day. A HSK 6 player chases HSK 6 legendaries. Nobody
is ever handed a trophy they cannot read.

Yield is `WORD_ORDER.filter(w => w.includes(char)).length`, already derivable
client-side from `apps/web/src/data/wordDex.ts`.

**Word rarity** uses the same scale and the same direction: a word's score is
the **mean yield of its characters**, ranked within its own HSK tier. Central
ingredients make a prized word.

(An earlier draft graded words by their *scarcest* constituent, which ran
opposite to the character rule — high yield made a character legendary but
made a word common. Writing the tests surfaced the contradiction. 咖啡 still
lands low under the corrected rule, but now for a coherent reason: 咖 and 啡
are phonetic-only characters that appear in almost nothing else, so the word
is not central vocabulary however familiar the drink is.)

### What rarity actually changes — aesthetics only

**Every card carries the same content**, whatever its rarity. Same stroke
animation, same etymology, same example sentences, same look-alike warnings,
same audio. No learner is ever denied the material that teaches a character
because of a dice roll.

Rarity is **purely the graphic design of the card.**

The constraint that shapes the whole system: the app is strict monochrome —
`cinnabar` collapses to pure black in light and pure white in dark
(`apps/web/src/theme.ts`). So rarity cannot be hue-coded the way Overwatch
used blue/purple/orange. It is coded by **material and light** instead, which
is both more distinctive and native to the app's ink-and-paper vocabulary.

| Rarity | Material | Surface | Frame | Light |
|--------|----------|---------|-------|-------|
| Common    | 纸 paper  | flat `ink2` | single hairline `line` | none |
| Rare      | 墨 ink    | deeper stock, near-black | double rule, inset | none |
| Epic      | 银 satin  | brushed metal, directional grain | corner ticks | static sheen |
| Legendary | 镜 mirror | mirror polish | bevelled foil edge | glitter flecks + hover sweep |

The ladder is an escalation in **how the card handles light**: paper absorbs
it, ink deepens it, satin catches it at an angle, mirror throws it back. Rarity
is felt before it is read.

**Legendary is already built.** `.dex-shiny` in `apps/web/src/index.css` is the
exact treatment — mirror-polish gradient at rest, static glitter flecks, gloss
sweep on hover/focus, and deliberately theme-independent because real foil
looks the same whichever way the page is lit. The other three grades are new,
and they are designed to build toward it rather than compete with it.

**Rarity pips** (• to ••••) sit bottom-centre, and carry the grade at
gallery-tile size where the finish alone gets subtle.

Two rules the treatments must not break:

1. **Legibility outranks decoration.** The hanzi is the card's job. On the
   metallic grades the glyph flips to near-black (`#16181B`) rather than
   white, because white-on-mirror fails contrast.
2. **Both themes.** Paper and ink invert with the theme tokens. Satin and
   mirror stay fixed in both, following the precedent `.dex-shiny` already set.

This also keeps the promise from earlier in the project: **a card never claims
knowledge the learner has not demonstrated.** A legendary 不 is still an
unproven card until it has been through 认/写/描. Rarity is how the card
*looks*, never what you have earned. Earning stays with the SRS.

---

## 2. Pack structure

Modelled on the OW1 loot box, whose disclosed odds were: common 99%,
rare 94%, epic 18.5%, legendary 7.5% per box; every box guaranteed at least
one rare-or-better; epic guaranteed within 5 boxes; legendary within 20;
duplicates auto-rerolled.

Four pack grades, matching the card grades. Pack grade sets the **guarantee
floor**, not the tier of content.

Every pack is **16 cards**. At the tier shares above that averages roughly
8 Common, 6 Rare, 1 Epic, and a Legendary every other pack — so a pack always
feels substantial, and the floor guarantees below decide how good it gets.

| Pack | Cards | Guarantee | Legendary odds |
|------|------:|-----------|---------------:|
| Common    | 16 | ≥1 Epic | 40% |
| Rare      | 16 | ≥2 Epic | 65% |
| Epic      | 16 | ≥1 Legendary | 100% |
| Legendary | 16 | ≥3 Legendary | 100% |

**Pity timers**, carried over from OW1: epic guaranteed within 5 packs,
legendary within 20. Tracked server-side per account.

**Tier band.** Packs draw from the learner's current tier and the one above
it, weighted 80/20. This is the pedagogical guardrail: a beginner is never
handed HSK 7-9 vocabulary they cannot place, but there is always a taste of
what is next. The band advances when a tier is 60% collected.

**Duplicates** convert to points rather than being rerolled — the OW1 credits
model, which gives dupes a floor value:

| Rarity | Duplicate value |
|--------|----------------:|
| Common    | 5 pts   |
| Rare      | 15 pts  |
| Epic      | 50 pts  |
| Legendary | 200 pts |

---

## 3. Points — earned by studying, not by collecting

The stated goal is to make users **spend time with cards rather than race to
collect them**. That goal is served by where points come from, and the rule
that does the work is this one:

> **Opening a pack earns zero points. Only proving a card earns points.**

Hoarding unopened or unstudied cards is worth nothing. The only route to more
packs runs through the cards you already hold.

| Action | Points |
|--------|-------:|
| Correct SRS review on a card that was actually due | 1 |
| Completing a proof (认 / 写 / 描) on a card | 5 |
| Passing 考 — full 精通 mastery | 25 |
| 7-day streak of clearing the due queue | 20 |

Pack costs: Common 150, Rare 400, Epic 900, Legendary 2000.

A Common pack therefore costs roughly six masteries or thirty proofs. The
grind is depth, not breadth — exactly the pressure you asked for, applied to
the part of the loop where learning actually happens.

---

## 4. Subscription tiers

| Tier | Packs / month |
|------|--------------:|
| 1 | 3  |
| 2 | 7  |
| 3 | 15 |

### The math, stated plainly

At 16 cards per pack, with no points spending:

| Tier | Cards/mo | 3,000 characters | All 13,954 slots |
|------|---------:|-----------------:|-----------------:|
| 1 | 48  | 5.2 yr | 24.2 yr |
| 2 | 112 | 2.2 yr | 10.4 yr |
| 3 | 240 | 1.0 yr | 4.8 yr  |

This is the right shape. Tier 3 collects the character dex in about a year
and the full 13,954 slots in five — long enough to be a genuine long game,
short enough that a committed learner can see the end of it. Tier 1 reaches
the characters in five years, which is slow but not a wall.

Worth keeping in view: difficulty should live in **mastery**, not
**acquisition**. Holding a card is not knowing it — the 认/写/描 ladder and
the 考 exam are where the hours go, and 13,954 slots proven three ways each
is an enormous amount of study even at Tier 3's acquisition rate. The packs
set the pace; the SRS sets the work.

The numbers above are levers. Cards-per-pack and the points rates move them
a lot, and the points economy below is deliberately tuned so a heavy studier
can roughly double their subscription's pack rate.

---

## 5. Import is removed

Decided 2026-08-19: **packs are the only way cards enter a collection.**
Upload and import come out.

Three things this drags with it, all of which need handling during the build:

- **Existing imported cards.** Users (including the dev account) hold cards
  that arrived by import. They need a migration: grandfather them in at a
  rarity computed from the same yield formula, so nobody loses proven work
  and the SRS history survives intact.
- **The roadmap needs rewriting.** Decision 0.5 ("read Chinese in the wild")
  had import as its most direct expression, and Track B was native camera
  capture. With acquisition now pack-driven, 0.5 needs restating in terms of
  what the app still does — you learn to read what packs give you, and the
  wild is where you *use* it rather than where you *source* it. Track B
  should be struck or re-scoped.
- **Onboarding changes completely.** A new account currently starts by
  importing something. It now starts by opening a pack, which is a better
  first thirty seconds anyway — but it is a new screen, not a modified one.

## 6. Regression suite

`apps/web/src/lib/packs.ts` implements the pure core — rating, pools, rolls,
pity, points. `apps/web/src/lib/packs.test.ts` guards it with 26 tests, run by
`npm test --workspace apps/web` alongside the existing suite.

The invariants worth naming, because they are the ones whose failure would be
silent:

- **The inversion guard.** 不, 人 and 子 must grade legendary. If a change
  ever files a 206-word workhorse as a common, the reward structure has
  flipped away from the learning structure and the feature is broken in the
  way this whole design exists to prevent.
- **Every tier keeps its own legendaries.** The property that lets a HSK 1
  learner pull a card they can use that afternoon.
- **Ratings are stable across calls.** A rarity that reshuffled between builds
  would silently restyle cards the user already collected.
- **Floors and pity timers always pay out**, checked across 40 seeds per pack
  grade rather than one lucky roll.
- **No duplicate inside a single pack**, and draws never leave the 80/20 tier
  band — including at HSK 7-9, where there is no tier above to fall into.
- **Opening a pack earns zero points.** Asserted directly (`"pack" in POINTS`
  is false), because the moment that changes, hoarding unstudied cards
  becomes viable and the study loop inverts.

Rolls take an injectable `rng`, so every pack test replays from a seed. A
floor that failed one roll in fifty would otherwise never be caught.

## 7. One flag before build

**Paid randomised packs are loot boxes, legally.** Belgium and the
Netherlands have restricted them; Apple's App Store guideline 3.1.1 requires
published odds for any paid random item; a language-learning app plausibly
has minors in its audience, which raises scrutiny further. This is not a
blocker and it is not an argument against the design — the odds tables above
are already written to be publishable, which is most of the compliance work.
It does mean the store listing and the regional strategy need a look before
launch rather than after.

A structure that sidesteps most of it: subscription grants packs, and points
buy packs, but **no direct cash purchase of an individual random pack.** Cash
buys time, not pulls. Worth considering.
