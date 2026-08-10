# 字帖 Zitie — Roadmap

Long-term feature plan beyond the shipped baseline (study/gallery/browse/import,
accounts, AI extraction, HSK character dex, study stacks). Decisions locked
2026-07-20.

## Confirmed decisions

0. **Patience over dopamine — the product philosophy (locked 2026-07-31).**
   Zitie is a *collection you tend over time*, the way a birder keeps a life
   list or a lepidopterist a specimen drawer — not a game chasing quick hits.
   The reward is starting from nothing and watching a real thing grow. This is
   a deliberate rejection of the streak/badge/daily-goal playbook, and it
   settles a class of proposals for good:
   - **No streaks, no badges, no daily goals, no placement quiz, no
     quick-onboarding shortcut.** These were raised in the 2026-07-31 QA
     report and *declined on purpose.* The empty starting state and the slow
     grind are the point, not friction to be engineered away.
   - **The three-proof dex already embodies this**: a slot measures competence
     you earned in three directions, not minutes logged or days in a row. That
     is the honest version of progress, and it's the whole game.
   - What we *do* invest in: making the patient path feel good — quiet study
     sessions, a collection that's a pleasure to browse, and specimens worth
     keeping (a finished brush sheet you can save). Retention comes from the
     relationship, not from nagging.
   Anything that proposes to shorten the climb, or to reward showing up rather
   than getting better, is out of scope by this decision.
0.5. **What Zitie is for: reading Chinese in the wild (locked 2026-08-03).**
   Signs, menus, chat, subtitles. Success is recognition speed and breadth.
   This was settled because the code was answering the question four different
   ways at once — the import pipeline said "retain what you meet", the HSK
   catalogs and exam said "pass a level", the dex said "build breadth", the
   etymology and brush said "understand characters deeply" — and with no
   stated goal nothing could be prioritised or cut, so every idea got bolted
   on. It resolves a class of questions:
   - **Recognition earns the dex slot; producing is depth above it.** See the
     2026-08-03 backlog. A slot that wanted all three proofs made the headline
     count a measure of handwriting, which is the least transferable of the
     three for this purpose.
   - **Handwriting is a memory aid, not the outcome.** The motor trace genuinely
     helps encoding, and 描 brush mode stays for that. But you will read Chinese
     daily and hand-write it approximately never — Chinese adults themselves
     have 提笔忘字 from typing pinyin. Leading with the brush was rejected on
     these grounds even though it is the most differentiated thing built.
   - **Characters and words are not siblings.** You read words; characters are
     why you can. ~3,000 characters covers ~99% of running text while words are
     unbounded, so the character dex stays the finishable spine. Merging the two
     catalogs into one flat list is out — it would throw away the only
     completable goal in the app.
   - **Distractors are judged on what defeats a reader**, which is the
     look-alike, not the unrelated meaning. See the 2026-08-03 backlog.

1. **Etymology is grounded in open data, not freestyled.** Ship IDS
   (Ideographic Description Sequences — component decomposition, e.g.
   吃 → ⿰口乞) + Unihan (radical, stroke count, reading, gloss) as static
   bundled datasets. The AI *explains* verified components; it does not invent
   which components exist. This is the difference between reliable and
   confidently-wrong.
2. **Character insights are cached shared across all users.** Decomposition of
   吃 is identical for everyone, forever — computed once, stored keyed by hanzi
   (not user_id), reused by every user for all time. Not personal data.
3. **Native apps via Capacitor.** Wrap the existing React web build into iOS +
   Android store apps; reuse ~100% of the current code and design. No React
   Native rewrite.
4. **Seed cost strategy: generate at build time, in Claude Code sessions,
   covered by the Pro subscription — not the paid API.** The deployed-app API
   path (~$75–150 for the whole dex via Batch) is avoided for pre-seeded
   characters by generating breakdowns in-session and committing them as static
   seed data. The runtime API path (needs credits) is reserved for the long
   tail of never-seeded characters a user uploads.

## Track A — Deep character/compound enrichment

Goal: for each character, show verified structure + a pedagogical semantic story
(e.g. 吃 = 口 *mouth* radical carrying the meaning "eat with the mouth" + 乞 *qǐ*
lending the sound), recursively for components worth explaining.

- **Schema + detail view — SHIPPED (commit c1894b9):** shared
  `character_insights` table (hanzi PK, structure, etymology type, component
  breakdown, story, compounds, source), joined to a card by hanzi on the detail
  view. The card's short `notes` field stays as-is.
- **Data — SHIPPED (commit 2b4673b):** `apps/api/data/hanzi.json`, 9,574
  characters distilled from CHISE IDS decompositions + Unihan/CEDICT readings,
  radicals and glosses (via makemeahanzi) + stroke counts. Generated by
  `npm run build:hanzi --workspace apps/api`, never hand-edited; read lazily
  through `lookupHanzi()`, which returns null rather than a guess.
- **Runtime (long tail, needs credits) — SHIPPED (commit ef8408a):** a
  never-seeded character is enriched once by a background worker — a tool-use
  loop whose only window onto structure is the bundled dataset — and written to
  the shared cache; card detail polls and shows "decoding…" until it lands.
  Grounding is enforced in code, not just prompt: components the data doesn't
  place inside the character are dropped before the row is written. This
  background worker is the long-term agentic surface — later powers
  compound-unlock hints, leveled examples, related characters.
- **Seed (build-time, $0 API) — SHIPPED, complete coverage:** every one of the
  3,000 HSK 3.0 dex characters has a breakdown in the database at release
  (`apps/api/data/insights-hsk.json`), composed from verified facts rather than
  written by a model — structure from the IDS operator, components and roles
  from the recorded etymology, "appears in" from real HSK vocabulary ranked by
  level then frequency. Where no bundled dataset records an account of a
  character, the story is hand-written instead (`data/stories.json`, 184 of
  them), so nothing in the database falls back to saying the data is silent.
  Those and the 18 hand-written HSK 1 entries win over the generated pass, and
  a re-seed leaves AI-enriched rows alone, so the runtime worker only ever runs
  for characters outside the dex — which is what it was for.
- **Word bank — SHIPPED:** all 10,954 HSK 3.0 word forms with reading, gloss,
  the level they're first examinable at, and the standard's part-of-speech
  annotations (`hsk_words`, migration 0006). Complete: the 272 entries
  CC-CEDICT doesn't list (transparent phrases like 车上, 看到) are hand-written
  in `hsk-words-supplement.json`, and 38 heteronyms whose everyday reading the
  dictionary heuristic gets wrong (打 is dǎ, not dá) are corrected in
  `readings-override.json`. Extraction reconciles against it: the standard's
  reading beats the model's, since a wrong tone is a wrong word.
- **Word dex — SHIPPED:** the vocabulary half of the collection game. All
  10,954 HSK words are slots in a second catalog (词鉴), collected the same way
  characters are — by having a card for them — with the same tracing-outline
  language for what you haven't got yet. The gallery switches between the two
  (字 / 词). Only written forms and levels are bundled client-side
  (`apps/web/src/data/wordDex.ts`, generated): a collected word's reading comes
  from the user's own card and an uncollected one is a mystery by design, so
  the whole catalog draws offline with no lookup. Rows are windowed
  (`lib/windowing.ts`) — HSK 7-9 alone is 5,602 slots and only ~50 tiles are
  ever in the DOM.
- **Model split — SHIPPED:** deep enrichment runs the top tier (Opus 5), since
  it happens once per character and is then reused by everyone forever.
  Extraction splits by difficulty rather than frequency: a photo stays on Opus
  4.8 (handwriting, glare, characters a stroke apart), typed or pasted text
  goes to Haiku 4.5, which is transcription. A 400 from the small model falls
  back to the large one.

## Track B — Take photo

- **Web/PWA — SHIPPED (commit 538a002):** a "Take photo" button using a file
  input with `capture="environment"` opens the rear camera on mobile browsers;
  falls back to a file dialog on desktop. Flows through the existing
  `fileToApiImage` pipeline. Native swap point marked with a code comment.
- **Native (with Track C):** `@capacitor/camera` `Camera.getPhoto()` into the
  same pipeline. Platform-detect: native camera in the app shell, file input on
  web.

## Track C — Mobile compatibility + native launch

1. **Mobile UX polish — SHIPPED (commit 11bd2c8):** safe-area insets
   (`env(safe-area-inset-*)`) on content + fixed nav, `touch-action:
   manipulation` (no double-tap-zoom delay), tap-highlight/overscroll tuning,
   16px inputs on coarse pointers (no iOS focus-zoom), dynamic theme-color.
2. **PWA — SHIPPED (manifest + icons 11bd2c8, service worker 1a31893):** the
   worker is generated at build time from the emitted bundle (`sw-template.js`
   + the `serviceWorker()` plugin in `vite.config.ts`), so the precache list
   and cache name always match the deploy. Navigations network-first, hashed
   assets cache-first, cross-origin untouched. Registered in production
   browsers only — not in dev, not in the Capacitor shell.
3. **Capacitor wrap — SHIPPED (commit c36b128):** Capacitor 8, Android + iOS
   platforms scaffolded, `@capacitor/camera` wired behind platform detection
   (native camera in the app shell, web input in a browser), on-brand native
   icons/splash. `appId: com.zitie.app` (placeholder — finalize before store
   submission). Remaining: iOS build/run needs macOS + Xcode; Android APK
   build needs Android Studio / SDK; `@capacitor/push-notifications` later.
4. **Store launch prerequisites (user action):** Apple Developer Program
   ($99/yr), Google Play Console ($25 once), privacy policy, screenshots,
   review. iOS specifically needs a Mac to archive + upload.

## Backlog — UI/UX — SHIPPED (commit 8532d30)

Four items raised after the spaced-repetition/audio/typography pass (a0dac6f),
all landed in one pass. What got decided, since the questions were open when
they were queued:

1. **Rating on dex tiles and browse rows.** Both readings of "rating" turned
   out to be worth showing: `masteryOf()` derives a 0–4 strength from the
   interval (capped when low ease or repeated lapses say the card keeps needing
   help), and `seen_state` gained a `last_grade` column (additive migration
   0005) so the button you actually pressed survives alongside the schedule it
   produced. A shared `Rating` atom renders the bar plus the grade glyph.
2. **Browse controls match Study.** Search stays pinned — it's the primary
   Browse action — with levels in a `MultiSelect` and everything else folded
   into the `Collapsible`. `FilterBar` retired.
3. **Audio on tiles and rows.** `SpeakBtn` became a sibling of the gallery
   tile rather than a child (nested buttons are invalid and Safari drops the
   inner one's clicks). Uncollected dex slots deliberately get no speaker —
   the reading would give away what the mystery view withholds.
4. **Write mode prompts in English.** `checkAnswer()` takes the characters or
   the reading, pinyin compared on letters alone. Characters grade `good`,
   reading-only grades `hard` — producing the character is the harder recall
   and the thing the app teaches.

## Backlog — next (queued 2026-07-27)

1. ~~**Upgrade the generated stories where they read flattest.**~~ — SHIPPED,
   all of them. The 184 dex characters whose etymology no bundled dataset
   records used to fall back to saying so ("the data records the parts but no
   account of how they came to mean…"); every one now has a hand-written
   account instead, and no story in the database says that any more. The
   hand-written half is only what a person has to decide — which components
   are worth naming, what each is doing, and the story. `build-curated.ts`
   fills in the rest (readings from `hanzi.json`, compounds from the generated
   pass) and refuses to build if a story names a component the dataset doesn't
   place inside the character, so the same grounding rule the runtime worker
   enforces applies to the writing too. `curated.test.ts` fails if a rebuild of
   `insights-hsk.json` ever introduces a flat story nobody has written yet.
   Two things fell out of doing it: a component that is only a shape now shows
   no reading and no gloss (labelling 去's top "tǔ · earth" invites a story
   that isn't there), and `pickCompounds` falls back to four-character idioms
   for the handful of characters — 六, 七 — that HSK 3.0 lists in nothing
   shorter.
2. **Watch the first real enrichment run.** The loop's mechanics are now
   covered by tests that drive it with a scripted client (`enrich.loop.test.ts`
   — tool offered, results fed back, JSON parsed, every failure mode raising
   rather than storing nonsense), so what's left unverified is narrow: whether
   the live API accepts this request shape, and whether the model's breakdowns
   read well. Both need a key — none in the dev environment; if one is in Fly
   secrets, the first uncollected non-HSK character opened after deploy is the
   test. Watch that the grounding filter isn't eating legitimate components.
3. ~~**Haiku for the extraction hot path**~~ — SHIPPED, split by difficulty
   rather than by frequency: a photo stays on the top tier (handwriting,
   glare, characters a stroke apart), typed or pasted text goes to Haiku,
   which is transcription. A 400 from the small model falls back to the large
   one, so a rejected request shape can't break someone's import. **Unverified
   against the live API** — no key in this environment — so watch the first
   text import after deploying.
4. ~~**Offline write path.**~~ — SHIPPED. Grades, views, card edits and settings
   that fail on the network are parked in a localStorage outbox
   (`storage/outbox.ts`) and replayed in order on reconnect and on next load;
   the header shows how many writes are waiting. Deletes and imports stay out
   on purpose — those should fail at the click, not succeed an hour later.
   Fixing this surfaced a second bug worth knowing about: `api.me()` failing
   for *any* reason dropped you on the login screen, so an offline reload
   logged you out and stranded the queue behind a form you couldn't submit. A
   rejected session and an unreachable one are now told apart.
5. ~~**Window the character dex too.**~~ — SHIPPED. Both catalogs now share
   `lib/useGridWindow`; ~60 tiles in the DOM whatever the level holds.
6. ~~**Study from the word dex.**~~ — SHIPPED. Both catalogs now carry a "学
   study these N" button that opens a session over exactly what's on screen,
   so a search or the collected filter narrows it. It runs through the same
   preselected-session mechanism as the stack but deliberately **does not
   write to the stack** — a dex selection is a one-off, the stack is a list
   you curated and come back to. Since the two now share that mechanism, a
   session says where it came from (`StudyOrigin`): "HSK 3 — words you have ·
   drawn from 63 collected" rather than claiming to be your stack.

## Backlog — next (queued 2026-07-28)

1. **Collection is earned, not imported — SHIPPED.** A dex slot used to fill
   itself the moment a card existed, so pasting a paragraph filled a hundred
   of them at once and none of them meant anything. A slot is now earned by
   proving the character in both directions, and the two proofs are recorded
   on `seen_state` (`read_ok`, `write_ok`, migration 0007):
   - **认 recognise** — read mode became a test. The character is shown with
     four English meanings, one of them right; distractors come from the
     user's own bank, ranked to share a part of speech so the answer is never
     the odd one out (`lib/choices.ts`). A correct pick grades "good" and
     banks the read proof, a wrong one grades "again" and sends the card back
     to the end of the deck — the same contract write mode already had, so
     both directions are tests rather than one test and one self-report. A
     bank too small to field plausible distractors keeps the classic
     flip-and-self-rate.
   - **写 write** — unchanged, and still accepts the reading as well as the
     characters. Producing the characters grades better, but requiring them
     for the proof would shut out anyone without a Chinese keyboard.
   - **The reward.** The moment the second proof lands, a banner names the
     slot — 收 collected · 字鉴 No. 0142. A banner rather than a modal: it
     arrives mid-session, and a dialog you have to dismiss to keep studying
     turns a reward into an interruption.
   - **The middle state.** A character in your bank but not yet earned gets
     its own tile — solid character, outlined slot, 认/写 showing which half
     is owed — and both dexes count it separately ("85 collected · 31 in
     progress"). The level button becomes "学 earn these N" and puts the
     unearned ones first.
   - **Migration.** Cards that were merely imported lose their slot, which is
     the point. Cards that had actually passed a review keep it: they were
     studied in good faith under the old rules, and taking the slot away
     retroactively would read as data loss rather than as a game.
   - Proofs are one-way. Forgetting a character later costs you the schedule,
     not the slot — `masteryOf` still moves both ways and is what the tile's
     strength bar shows.
   - Superseded by the 2026-07-29 item below: collection now wants a third
     proof, 描 brush.

## Backlog — next (queued 2026-07-29)

1. **描 brush mode, and the third proof — SHIPPED.** A brush pad where the
   character is written by hand, and the only study mode that checks *how* a
   character is formed rather than just which one it is. Collection now wants
   three proofs: 认 recognise, 写 write, 描 brush.
   - **Real grading, not a sketchpad.** makemeahanzi records each stroke's
     centreline (`medians`), so a drawn stroke can be matched against the one it
     was aiming at: `lib/strokes.ts` resamples both to a common length, pairs
     them greedily one-to-one, and reports which strokes landed, which were
     missed, which were spurious, and whether the sequence was the taught one.
     Direction counts — a stroke drawn right-to-left scores badly, because that
     is a real error.
   - **Completeness earns the slot; order is coached.** Writing 思 with the box
     built the wrong way round is still writing 思, so the proof asks for every
     stroke and the sequence gets the "written in a different stroke order ·
     show me" nudge, which walks the taught order stroke by stroke.
   - **The brush.** A stroke is stored as the points and timings it was drawn
     with, never as pixels, so the ink controls restyle writing that already
     exists (`lib/ink.ts`): weight, wetness, speed, formality and a seed, plus
     plain/grid/scroll paper and write/trace. Width follows speed and tapers at
     both ends; a dry fast tail splays into bristles; a wet one bleeds instead.
     All randomness is seeded, so dragging a slider restyles the character
     rather than making it crawl.
   - **Data.** `character_strokes` (migration 0008), shared across users like
     `character_insights` — 7.6 MB for the 3,000 dex characters, so it is served
     one character at a time and cached in memory and localStorage rather than
     bundled. `build:strokes` generates it; the app falls back to freehand with
     no grading for a character with no geometry (compounds, mostly).
   - **Migration.** Anything already collected under the two-proof rule keeps
     its slot. Only characters earned from here on have to be brushed too —
     same reasoning as 0007: the change should be felt going forward, not
     applied to the past.

## Backlog — next (queued 2026-07-31)

1. **The brush, as a brush — SHIPPED.** Four changes to 描 mode after using it.
   - **Words are graded character by character.** A word card walks its
     characters in turn — 咖啡 is 咖 then 啡 — with a pad per character and one
     verdict for the whole word (`combineVerdicts`). The weakest character sets
     the result, so writing 咖 and giving up earns nothing; a character with no
     stroke geometry is skipped rather than failed, since the pad had nothing
     to grade it against. This makes the word dex's 10,954 slots collectable,
     which they were not before.
   - **The controls sit beside the paper.** They were behind a disclosure that
     pushed the pad off the screen the moment it opened. Brush mode now breaks
     out of the app's 448px column to full width, paper on the left and the
     brush tray on the right, the tray going to two columns once there is room.
     The pad gives up height when side by side so the whole screen fits without
     scrolling; stacked on a phone it keeps its width, because the page scrolls
     there anyway and a shrunken pad is just a worse pad.
   - **The controls are artistic properties, not renderer knobs.** 濃 density,
     潤 water, 飛白 flying white, 提按 press, 側鋒 tilt, and a 手 hand seed. Each
     changes the picture in a way you can point at: water closes the dry gaps
     and holds an even tone, a dry brush fades along its stroke and splits into
     fibre, tilt runs one flank of the stroke heavier than the other.
   - **It looks painted.** Ink is a warm near-black that varies in tone along
     each stroke as the brush spends what it carries, never flat. Paper is a
     generated sheet (`lib/paper.ts`) with fibres, tonal drift and a vignette,
     cached per size so it doesn't recompute on every pointer move.

## Backlog — QA polish — SHIPPED (2026-07-31)

From a full QA pass (`scratchpad/qa/QA-REPORT.md`). The report's onboarding and
retention-loop proposals were **declined** under decision #0; these are the
quality-of-life fixes that were accepted, all landed together:

- **Dark-mode brush was unusable** — near-black ink on a near-black sheet. The
  paper now stays a lit warm sheet in both themes (a dark room, not dark paper,
  the way calligraphy actually works), so ink reads in dark mode. `PAPER_TONES`
  collapsed to one `PAPER_TONE`.
- **Export your bank** — a button in Browse downloads the whole bank as JSON in
  the Import format, so a backup is also a way to move between accounts. The
  endpoint existed with no UI; now it has one.
- **Keyboard-drivable study** — 1–4 answer the read quiz, Enter/Space turns the
  page. Desktop no longer needs the mouse for the core loop.
- **The answer stays on the table** — a wrong pick used to clear the four
  options; they now stay, the right one marked ✓ and your miss ✕, because
  recalling *which* of the four it was is the memory being trained.
- **The session gets a quiet room** — the account chrome (email, theme, logout,
  bank count) hides while a deck is running and returns when it ends.
- **The brush tray teaches** — each slider shows its one-line meaning ("dry
  streaks through the stroke"), turning the panel into a small calligraphy
  lesson; two columns from 768px so it fits beside the paper.
- **Save the sheet** — a finished brush character downloads as a PNG, a
  specimen for the notebook (and, incidentally, shareable).
- **Kinder server messages** — a failed AI import no longer names
  `ANTHROPIC_API_KEY` at the learner; the login limiter keys per-account with a
  looser per-IP ceiling, so a classroom behind one NAT doesn't lock itself out.
- The difficulty slider now labels its ends ("short, mostly review" → "long,
  mostly new").

## Backlog — next (queued 2026-08-02)

1. **精通 mastery, and the 考 exam — the second bar — SHIPPED.** Collection asks
   you to produce a character three ways with the study screen's help. Mastery
   is the same three ways proven *strict*, and it is what turns a card shiny.
   This is deliberately the patience payoff of decision #0: a shiny is earned
   slowly, over separate sittings, not handed out for a streak.
   - **The exam is its own place, not a mode of Study.** A 考 entry on the
     gallery (`ExamView`) gathers every collected, due, not-yet-mastered card
     and sits it strict in each direction it still owes: 认 recognise from five
     meanings not four, 写 write the characters only (the reading is not a pass
     here), 描 brush with no numbered order, no tracing, no "show me", and every
     stroke in the taught sequence or it doesn't count. A "final boss", by
     request — an exam should feel like one.
   - **Marks, not a flag.** Mastery is `MASTERY_MARKS` (3) clean passes banked
     in *each* direction — `read_marks`/`write_marks`/`brush_marks` on
     `seen_state`, set upward and capped like the proofs, exposed through
     `serializeSeen` (the one wire shape, guarded by `seenWire.test.ts`). Kept
     per-direction so the exam has to test every skill: you can't brush your way
     to a shiny you can't read.
   - **It can't be farmed in one go.** A mark banks only on a clean pass of an
     already-collected card, and a pass reschedules the card out of the due
     pool — so the ninth mark lands over at least three separate sittings, days
     apart. The server enforces both (`routes/seen.ts`): no exam flag, no mark;
     not collected, no mark; capped with `least(... + 1, MASTERY_MARKS)`.
   - **Shiny now means mastered.** The gallery's shiny/chrome tile used to mean
     *data-complete* (radical + strokes + examples + notes), which was a
     property of the card, not of the learner. It now means `isMastered` — the
     dex's rarest, loudest state is reserved for the thing actually worth the
     glow. `CardDetail` shows the three directions and their banked marks as
     pips, so the path to shiny is legible.
   - **The reward.** When the ninth mark lands, a `MasteredBanner` stops the
     room — a lit, gold-sheened card over a dimmed app, louder than the quiet
     ink banner collection uses, because mastery is a far rarer moment. Raised
     once per character, like collection.

## Backlog — reading-first (SHIPPED 2026-08-03, PRs #8 and the look-alike merge)

Everything here follows from decision 0.5. Recorded because the reasoning is
worth more than the diffs — each of these was a defect *relative to the stated
intention*, and each was defensible before it was stated.

1. ~~**Earn the dex slot by reading, not by writing.**~~ — SHIPPED (d19023c).
   `isCollected` wanted all three proofs, which quietly made the gallery's
   headline count a measure of handwriting: someone who could recognise 800
   characters and hand-write 40 was told they had collected 40. Recognition now
   earns the slot; `hasProduced` is the rung above; the 考 exam keeps the
   stricter bar as `isFullyProven`, since sitting a brush exam on a character
   never once brushed would be unfair. **Nothing can lose a slot** — the old
   rule's set is a strict subset of the new one; on the dev bank it moved 6
   collected to 12. Also split the two things both called mastery:
   `strengthOf` is the scheduler's running estimate and moves both ways,
   `isMastered` is the one-way 精通 tier. Naming both the same made the ladder
   unreadable.
2. ~~**Test recognition in context.**~~ — SHIPPED (834b586). The wild does not
   show you one character on a white card. A character the scheduler trusts
   (strength ≥ 2) now appears inside a real HSK word — 茶 alone when new, 红茶
   once known — target at full ink, neighbours quiet. Every reveal also lists
   up to four real words it appears in, because reading is associative. Context
   comes from the bundled HSK 3.0 list, never invented: a character with no HSK
   word, or a card that is already a word, is shown alone.
3. ~~**Stop printing the answer inside its own option.**~~ — SHIPPED (4cb5adf).
   Bound forms are glossed by the word they live in, so 啡's meaning was
   literally "used in 咖啡 (coffee)" — the character under test appearing inside
   its own correct answer, answerable by matching glyphs having read nothing.
   Item 2 made it exact rather than merely easy. `optionGloss` unwraps the
   usage note to the English it carried, applied to **every** option (sanitising
   only the answer swaps a glyph tell for a formatting one), and
   `meaningChoices` refuses any set that still contains a hanzi. Correctness
   moved into `isAnswer` beside the option building: options are sanitised on
   the way out, so the five call sites comparing against raw `card.meaning`
   would each have marked every bound form wrong.
4. ~~**Look-alike distractors.**~~ — SHIPPED (7458111). Options were ranked on
   part of speech and gloss length only, so the test never asked what reading
   actually asks — can you tell 木 from 本. **67% of HSK1 characters have a
   look-alike inside HSK1 itself**, so for a beginner this was the majority
   case, not an edge one. One option slot is now reserved for a visually
   confusable character, drawn from a map generated from the same makemeahanzi
   stroke geometry brush mode grades against (rasterised, cosine-compared, cut
   by z-score because raw similarity is not comparable across characters).
   Reserved rather than blended into the ranking: the pool is hundreds deep and
   the final three are drawn at random from its closer half, so a blended
   look-alike would surface at exactly the rate the test fails to ask its
   question. **Costs 53 KB gzipped (+37%)** — `MAX_PER_CHAR` in the generator
   trims ~40% of that if the bundle ever bites.
5. ~~**Pronunciation explains itself instead of vanishing.**~~ — SHIPPED
   (946f81b, ec9b48f). `SpeakBtn` returned null with no Mandarin voice
   installed, which on a stock Windows machine is the default — so every audio
   control in the app rendered as nothing at once, indistinguishable from a
   feature nobody built, and the one thing that fixes it was never mentioned.
   Controls now stay put, muted, carrying the reason and the remedy. Auto-speak
   was removed in the same pass: audio is a preview you press, not a session
   setting that talks over you every few seconds.
6. ~~**Stop auto-deploying to Fly.**~~ — SHIPPED (024db21). The workflow ran
   `flyctl deploy` on every push to main and `fly.toml`'s release command would
   have migrated and seeded production on the way. Nothing had ever deployed,
   so the first push that happened to land would have been the first production
   release, decided by timing rather than by anyone. `fly.toml`, the Dockerfile
   and DEPLOY.md stay — inert, and holding the release command and health checks
   a real deploy will want.

**Still open from this run:** the dex restructure that decision 0.5 implies —
characters lead as progress, and the word dex becomes the readout of what they
have unlocked ("412 HSK words now readable") rather than a parallel grind with
its own switch and its own count. Agreed in principle, not started.

## Backlog — pronunciation (designed then removed 2026-08-04, to be re-planned)

**Built, then taken back out.** It was implemented and merged as 99589be and
reverted the same day — not because anything was wrong with it, but because it
is blocked on a credential and shipping a whole dormant subsystem to wait for
one is clutter. **The code is recoverable in full: `git show 99589be`, or
`git revert` the revert.** What follows is the design and the reasoning, so a
future session re-plans from the findings rather than from scratch.

What remains in the tree: the browser-voice pronunciation buttons, unchanged.
They were asked for separately and still work — muted with an explanation where
no Mandarin voice is installed.

**The finding worth keeping, because it outlives the provider choice.** Voice
quality was never the main problem. A bare hanzi handed to *any* TTS engine is
a guess whenever the character has more than one reading, and Mandarin has
hundreds: 行 is xíng or háng, 还 is hái or huán, 好 is hǎo or hào. The engine
picks by context and a flashcard has none, so the app would teach the wrong tone
with total confidence — five of the 116 cards in the dev bank, several hundred
across the dex. Every card already stores the reading it means, so the fix is to
stop letting the engine choose. **Any provider considered later has to be judged
on phoneme control first and voice quality second.**

What 99589be contained, and would restore:
- `apps/api/src/lib/pinyin.ts` — stored reading → Azure `sapi` phoneme
  (`xíng` → `xing2`, `kāfēi` → `ka1 fei1`). Handles tone marks or digits,
  spaced or unspaced, ü either spelling. Returns null rather than guessing;
  all 1,527 single-character readings and 10,902 of 10,954 total entries
  convert. 13 tests.
- `apps/api/src/lib/tts.ts` — `Synthesizer` interface + `AzureSynthesizer`.
  **A different provider is one new class and one line in `synthesizerFromEnv`;
  nothing else in the app knows or cares.** 9 tests, no key needed.
- `character_audio` (migration 0010) — fourth shared reference table beside
  `character_strokes` / `character_insights`. Keyed by (hanzi, phoneme), not by
  hanzi, so 行 holds both its clips.
- `apps/api/scripts/seed-audio.ts` — `db:seed-audio`, idempotent and resumable,
  sourced from `hsk_words` so it inherits `readings-override.json`'s
  hand-checked heteronyms. Deliberately **not** in `db:deploy`: a release must
  not depend on a credential the app never uses.
- `POST /audio` + `lib/speech.ts` — clip preferred, browser voice as fallback,
  and deliberately no third tier (an en-US voice reading chá is worse than
  silence).

**Why it's parked:** Azure needs a subscription, and the free trial wants a
credit card for identity verification. Not worth it pre-production.

**Cost, once there is a subscription:** 21,749 billed characters for the entire
corpus — 4.3% of one month's free F0 allowance, so realistically £0. One-time,
not per-play: clips are stored and served like any other reference data.

**To resume:** restore the code first — `git revert` the revert commit, or
cherry-pick 99589be — then re-run `db:migrate` to recreate `character_audio`
(the table was dropped from the dev database when the code came out). After
that: create a Speech resource (tier F0), put `AZURE_SPEECH_KEY` and
`AZURE_SPEECH_REGION` in `apps/api/.env`, then
`npm run db:seed-audio --workspace apps/api -- --limit 20` to audition the voice
before the full run. Then check 行 specifically — it must say xíng, not háng. If
it says háng the phoneme isn't reaching the engine, and that is the whole point.

**Alternatives, if Azure stays unattractive:** `edge-tts` reaches the same
Microsoft neural voices with no account, but it is an unofficial client for an
undocumented endpoint — fine to audition with, a liability to ship on. OpenAI
and ElevenLabs sound good but have no phoneme control, so polyphones revert to
guesses; on the reasoning above that is a downgrade, not a substitute.

## Sequencing

1. ~~Mobile UX polish + PWA~~ — done (11bd2c8, 1a31893).
2. ~~Take photo (web `capture` MVP)~~ — done (538a002); native camera in c36b128.
3. Deep AI enrichment — data, schema, and the runtime worker are done
   (c1894b9, 2b4673b, ef8408a); in-session seed generation is the open half.
4. Capacitor native wrap ~~+ store launch~~ — the wrap shipped (c36b128); store
   launch is blocked on the user-action prerequisites in Track C #4.

## Cost reality

- Datasets: no usage limit (static files).
- Anthropic API: pay-as-you-go (credit balance is the limiter, not a
  subscription quota) + tier-scaled per-minute rate limits. Claude Pro does NOT
  cover the app's API calls — separate billing.
- Shared cache + in-session seeding makes the common case ~$0 in API terms;
  only the never-seeded long tail draws credits, as a trickle.
