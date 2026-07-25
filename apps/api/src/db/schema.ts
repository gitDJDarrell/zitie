import { boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
