import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // opaque random token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Single-use password reset tokens; only the SHA-256 of the token is stored,
// so a database leak doesn't yield working reset links.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Mirrors the client card shape: { id, hanzi, pinyin, meaning, pos[], compound,
// radical?, strokes?, examples[]?, notes?, starred?, added }
export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hanzi: text("hanzi").notNull(),
  pinyin: text("pinyin").notNull(),
  meaning: text("meaning").notNull(),
  pos: jsonb("pos").$type<string[]>().notNull().default([]),
  compound: boolean("compound").notNull().default(false),
  radical: text("radical"),
  strokes: integer("strokes"),
  examples: jsonb("examples").$type<{ zh: string; py?: string; en?: string }[]>(),
  notes: text("notes"),
  starred: boolean("starred").notNull().default(false),
  added: text("added").notNull(), // ISO date string, e.g. "2026-07-18"
  // Cosmetic grade, stamped once when the card is granted. Deterministic from
  // the hanzi (see lib/rating.ts), but stored rather than recomputed so the
  // client never has to derive it and a later change to the formula cannot
  // restyle cards someone already owns.
  rarity: text("rarity").notNull().default("common"),
  // How the card entered the collection: "pack" | "grandfathered". The default
  // is deliberately "grandfathered": any row that takes it was not dealt by a
  // pack, so a row can always say honestly where it came from. POST
  // /packs/open writes "pack" explicitly.
  source: text("source").notNull().default("grandfathered"),
}, (t) => ({
  userHanziIdx: uniqueIndex("cards_user_hanzi_idx").on(t.userId, t.hanzi),
}));

// One row per card once it's been studied at least once. `last`/`views` are
// the raw view tally; the rest is SM-2-lite spaced-repetition state, written
// only by POST /seen/grade. A row with reps = 0 has been looked at but never
// graded, so it still counts as "unscheduled".
export const seenState = pgTable("seen_state", {
  cardId: text("card_id").primaryKey().references(() => cards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  last: timestamp("last", { withTimezone: true }).notNull(),
  views: integer("views").notNull().default(0),
  // SM-2 ease factor, clamped to [1.3, 3.0]. Lower = card comes back sooner.
  ease: real("ease").notNull().default(2.5),
  // Current scheduling interval in days; fractional for sub-day relearns.
  intervalDays: real("interval_days").notNull().default(0),
  // When the card is next due. Null = due immediately (never graded).
  due: timestamp("due", { withTimezone: true }),
  reps: integer("reps").notNull().default(0),   // consecutive successful grades
  lapses: integer("lapses").notNull().default(0), // times graded "again" after a success
  // The button actually pressed last time — again|hard|good|easy. Kept
  // alongside the derived schedule because "what did I rate this?" and "how
  // well do I know it?" are different questions the UI answers separately.
  lastGrade: text("last_grade"),
  // Proof of recall, one flag per direction, and the two together are what
  // earns a character its dex slot. They are deliberately separate from the
  // schedule: the SRS says how well you are holding the card, these say
  // whether you have ever actually produced the answer — recognised the
  // meaning from the character (read), and produced the character or its
  // reading from the English (write). Set once, never cleared by a later
  // miss; a collected character stays collected, the schedule takes the hit.
  readOk: boolean("read_ok").notNull().default(false),
  writeOk: boolean("write_ok").notNull().default(false),
  // Written by hand with the brush, in the right stroke order. The hardest of
  // the three and the only one that checks *how* the character is formed
  // rather than just which one it is.
  brushOk: boolean("brush_ok").notNull().default(false),
  // Mastery marks — the second, higher bar above collection. A collected card
  // (all three proofs) enters the 考 exam, where it is tested strict, with no
  // assistance, in each direction; a clean strict pass banks a mark. Mastery is
  // MASTERY_MARKS of each, earned over separate sittings (a strict pass
  // reschedules the card, so the exam can't be farmed in one go). Set only
  // upward, like the proofs.
  readMarks: integer("read_marks").notNull().default(0),
  writeMarks: integer("write_marks").notNull().default(0),
  brushMarks: integer("brush_marks").notNull().default(0),
});

// Stroke geometry, shared across all users like character_insights — the
// strokes of 思 are the same for everyone. `strokes` are SVG paths for drawing
// the glyph; `medians` are each stroke's centreline in written order, which is
// what brush mode grades against. Both in makemeahanzi's 1024x1024 space.
export const characterStrokes = pgTable("character_strokes", {
  hanzi: text("hanzi").primaryKey(),
  strokes: jsonb("strokes").$type<string[]>().notNull().default([]),
  medians: jsonb("medians").$type<number[][][]>().notNull().default([]),
});

// Deep character breakdowns — shared across ALL users (keyed by hanzi, not
// user_id): the decomposition of 吃 is identical for everyone, so it's computed
// once and reused forever. Seeded in-session from grounded data (makemeahanzi /
// IDS / Unihan); the long tail is filled at runtime by the enrichment worker.
export const characterInsights = pgTable("character_insights", {
  hanzi: text("hanzi").primaryKey(),
  structure: text("structure"),            // human-readable, e.g. "⿰ left–right"
  etyType: text("ety_type"),               // pictophonetic | ideographic | pictographic | none
  components: jsonb("components").$type<{
    char: string; reading?: string; gloss?: string;
    role: "semantic" | "phonetic" | "meaning" | "form"; note?: string;
  }[]>().notNull().default([]),
  story: text("story"),                     // the pedagogical synthesis
  compounds: jsonb("compounds").$type<{ zh: string; py?: string; en?: string }[]>().notNull().default([]),
  source: text("source").notNull().default("seed"), // seed:hsk1 | ai:<model>
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The official HSK 3.0 vocabulary, shared across all users and shipped with
// the release — every word a learner can unlock already has its reading and
// meaning, so unlocking one never waits on a model call. Keyed by the written
// form; a word listed at several levels keeps the earliest in `level` and all
// of them in `levels`.
export const hskWords = pgTable("hsk_words", {
  zh: text("zh").primaryKey(),
  pinyin: text("pinyin"),                   // tone marks, e.g. "àihào"
  meaning: text("meaning"),                 // English gloss, senses split by "; "
  level: text("level").notNull(),           // "1".."6" | "7-9" — matches the dex level ids
  levels: jsonb("levels").$type<string[]>().notNull().default([]),
  // Parts of speech only where the standard annotates one (它 vs 他（代）).
  pos: jsonb("pos").$type<string[]>().notNull().default([]),
  compound: boolean("compound").notNull().default(true),
}, (table) => ({
  levelIdx: index("hsk_words_level_idx").on(table.level),
}));

// The pack economy, one row per user. Points are earned only by proving cards
// (see routes/seen.ts) — opening a pack pays nothing, or hoarding unstudied
// cards becomes a viable strategy and the study loop inverts.
export const wallet = pgTable("wallet", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  // Subscription tier 1|2|3 — grants 3, 7 or 15 packs a month.
  tier: integer("tier").notNull().default(1),
  // Unopened packs, counted per grade: { common, rare, epic, legendary }.
  packs: jsonb("packs").$type<Record<string, number>>().notNull().default({}),
  // Anchor for the monthly grant; the grant is applied lazily on read so a
  // user who does not open the app for two months does not accrue a backlog.
  periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
  // Pity timers, carried over from the OW1 loot box: an epic is guaranteed
  // within 5 packs and a legendary within 20, counted since the last one.
  sinceEpic: integer("since_epic").notNull().default(0),
  sinceLegendary: integer("since_legendary").notNull().default(0),
  // Highest HSK tier the learner draws from; advances as a tier fills.
  tierBand: text("tier_band").notNull().default("1"),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("light"),
  // User-curated study stack: an ordered list of card ids preselected for a
  // future session, independent of the star flag (see BrowseView "stack" view).
  stack: jsonb("stack").$type<string[]>().notNull().default([]),
  // Speak the hanzi aloud automatically when a card's answer is revealed.
  autoSpeak: boolean("auto_speak").notNull().default(true),
  // Session difficulty step (0-4) — scales card count and HSK level ceiling.
  difficulty: integer("difficulty").notNull().default(2),
});
