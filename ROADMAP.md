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
3. **Capacitor wrap:** add iOS/Android platforms, `@capacitor/camera` (upgrades
   Track B's Take photo to native), later `@capacitor/push-notifications`.
4. **Store launch prerequisites (user action):** Apple Developer Program
   ($99/yr), Google Play Console ($25 once), privacy policy, screenshots,
   review.

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
