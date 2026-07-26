# 字帖 Zitie — Roadmap

Long-term feature plan beyond the shipped baseline (study/gallery/browse/import,
accounts, AI extraction, HSK character dex, study stacks). Decisions locked
2026-07-20.

## Confirmed decisions

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

- **Data:** bundle IDS + Unihan (static, no usage limit).
- **Schema:** new shared table `character_insights` (hanzi PK, decomposition
  JSONB, component breakdown, explanation, source/model/version). Joined to a
  card by hanzi on the detail view. The card's short `notes` field stays as-is.
- **Seed (build-time, $0 API):** generate grounded breakdowns in Claude Code
  sessions, commit as seed/migration data. Start with the current bank, then
  HSK 1 (300), expanding outward across sessions.
- **Runtime (long tail, needs credits):** for a user-uploaded character with no
  cached insight, an async background worker enriches it once (tool-use loop
  over the IDS/Unihan lookup tools, model-driven recursion depth) and writes it
  to the shared cache. Card detail shows "decoding…" until it lands. This
  background worker is the long-term agentic surface — later powers
  compound-unlock hints, leveled examples, related characters.
- **Model split:** cheap model (Haiku) for the hot-path screenshot extraction;
  top-tier (Opus 4.8) for the amortized deep enrichment.

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
2. **PWA — manifest + icons SHIPPED (11bd2c8);** service worker (offline app
   shell) still TODO — builds on the existing localStorage cache.
3. **Capacitor wrap — SHIPPED (commit c36b128):** Capacitor 8, Android + iOS
   platforms scaffolded, `@capacitor/camera` wired behind platform detection
   (native camera in the app shell, web input in a browser), on-brand native
   icons/splash. `appId: com.zitie.app` (placeholder — finalize before store
   submission). Remaining: iOS build/run needs macOS + Xcode; Android APK
   build needs Android Studio / SDK; `@capacitor/push-notifications` later.
4. **Store launch prerequisites (user action):** Apple Developer Program
   ($99/yr), Google Play Console ($25 once), privacy policy, screenshots,
   review. iOS specifically needs a Mac to archive + upload.

## Backlog — UI/UX (queued 2026-07-26, for next session)

Four items raised after the spaced-repetition/audio/typography pass (a0dac6f).
Notes below flag the decisions and gotchas each one hits, so the work can start
cold.

### 1. Show the rating on cards in Gallery and Browse

Surface a card's spaced-repetition standing on the dex tiles
(`apps/web/src/views/GalleryView.tsx`) and the list rows
(`apps/web/src/views/BrowseView.tsx`) — today the tiles show only the dex
number + ★, and rows show `pos · compound — seen Nd ago`.

- **Open decision:** "rating" could mean (a) the last grade you gave, or
  (b) a derived mastery score from `ease`/`reps`/`lapses`. These need different
  work — **(a) requires a schema change**, because `seen_state` currently stores
  only the *resulting schedule*, not which button was pressed. Add a
  `last_grade` column if (a) is what's wanted.
- (b) needs no migration: `SeenRecord` already carries `ease`, `reps`,
  `lapses`, `due`, `intervalDays`. Add a `masteryOf(rec)` helper next to the
  existing `isDue` / `isScheduled` in `apps/web/src/lib/srs.ts`.
- Gallery tiles are tight (56px) — likely a dot/bar glyph rather than text.
  The shiny/chrome treatment already occupies the "fully completed" signal, so
  pick something that reads distinctly from it.

### 2. Rebuild Browse's controls to match the Study tab

Study now leads with a levels `MultiSelect`, a difficulty `Slider`, and a
`Collapsible` filter block summarising anything active. Browse still uses the
older `FilterBar` (`apps/web/src/components/FilterBar.tsx`) with always-visible
search + POS chips + age/starred toggles.

- All three components are already shared in
  `apps/web/src/components/atoms.tsx` — this is mostly recomposition, not new
  UI work.
- Browse's search box has no Study equivalent; decide whether it stays pinned
  above the collapsible block (probably yes — search is the primary Browse
  action) or folds in with the rest.
- Keep Browse's select-mode/bulk-actions row working; it's independent of the
  filter chrome but shares vertical space.

### 3. Audio on Gallery tiles and Browse rows

`SpeakBtn` (atoms) and the Web Speech API layer (`apps/web/src/lib/speech.ts`)
already exist, and `CardDetail` — the modal both views open — already speaks.
The gap is pronunciation *without* opening a card.

- **Gotcha:** Gallery tiles and Browse rows are themselves clickable. A
  `<button>` inside a `<button>` is invalid HTML and misbehaves in Safari.
  Gallery tiles will need restructuring (wrapper `div` with two sibling
  buttons, or a non-button tile) — `SpeakBtn`'s existing `stopPropagation`
  handles the click bubbling but not the nesting.
- `SpeakBtn` already renders nothing when no Mandarin voice is installed, so
  no dead controls on devices without one.

### 4. Write mode: prompt in English, accept hanzi or pinyin

Today (`apps/web/src/views/StudyView.tsx`) write mode shows **pinyin + meaning**
and requires an exact `card.hanzi` match. Wanted: show the **English** only, and
accept either the hanzi or the pinyin as a correct answer.

- Showing pinyin today gives the answer away for the pinyin half — that's the
  main reason to change it.
- Pinyin matching should be tone- and spacing-insensitive; `normalizePinyin`
  in `apps/web/src/lib/pinyin.ts` already does this (it backs Browse search)
  and returns a `.letters` form to compare against.
- Grading already flows into the scheduler (correct → `good`, miss → `again`),
  so only the prompt and the comparison in `check()` change.
- Decide whether hanzi and pinyin are equally correct, or whether pinyin-only
  counts as a partial (e.g. grades `hard` instead of `good`).

## Sequencing

1. Mobile UX polish + PWA (foundational; unblocks native).
2. Take photo (web `capture` MVP; pairs with #1).
3. Deep AI enrichment (IDS/Unihan data → `character_insights` schema →
   in-session seed generation → async runtime worker). Parallelizable with 1–2.
4. Capacitor native wrap + store launch (after web is mobile-polished).

## Cost reality

- Datasets: no usage limit (static files).
- Anthropic API: pay-as-you-go (credit balance is the limiter, not a
  subscription quota) + tier-scaled per-minute rate limits. Claude Pro does NOT
  cover the app's API calls — separate billing.
- Shared cache + in-session seeding makes the common case ~$0 in API terms;
  only the never-seeded long tail draws credits, as a trickle.
