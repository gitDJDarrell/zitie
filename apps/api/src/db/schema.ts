import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

// One row per card once it's been studied at least once.
export const seenState = pgTable("seen_state", {
  cardId: text("card_id").primaryKey().references(() => cards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  last: timestamp("last", { withTimezone: true }).notNull(),
  views: integer("views").notNull().default(0),
});

export const settings = pgTable("settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("light"),
  // User-curated study stack: an ordered list of card ids preselected for a
  // future session, independent of the star flag (see BrowseView "stack" view).
  stack: jsonb("stack").$type<string[]>().notNull().default([]),
});
