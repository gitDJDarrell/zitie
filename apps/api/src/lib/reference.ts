// Reconciles freshly extracted cards against the pre-seeded HSK bank.
//
// The extraction model reads a photo; the standard's word list is a fixed
// fact. Where they disagree about a word's reading, the standard is right —
// tones are exactly what a model misreads off a blurry textbook page, and a
// wrong tone is a wrong word. The gloss stays as extracted: it was written for
// a flashcard, in the context the photo gave, while the dictionary's is a
// semicolon-separated sense list. The standard fills in only what's missing.
import { inArray } from "drizzle-orm";
import { hskWords } from "../db/schema.js";

export interface ReferenceWord {
  pinyin: string | null;
  meaning: string | null;
  pos: string[];
  compound: boolean;
  level: string;
}

interface ExtractedCard {
  hanzi?: unknown;
  pinyin?: unknown;
  meaning?: unknown;
  pos?: unknown;
  compound?: unknown;
  [key: string]: unknown;
}

/**
 * Applies the standard to one batch of extracted cards. Pure — the database
 * lookup is the caller's, so this is testable and so a batch costs one query.
 */
export function reconcileCards<T extends ExtractedCard>(
  cards: T[],
  reference: Map<string, ReferenceWord>,
): T[] {
  return cards.map((card) => {
    const hanzi = typeof card.hanzi === "string" ? card.hanzi : null;
    const ref = hanzi ? reference.get(hanzi) : undefined;
    if (!ref) return card;

    const pos = Array.isArray(card.pos) ? card.pos : [];
    return {
      ...card,
      ...(ref.pinyin ? { pinyin: ref.pinyin } : {}),
      ...(!card.meaning && ref.meaning ? { meaning: ref.meaning } : {}),
      ...(pos.length === 0 && ref.pos.length ? { pos: ref.pos } : {}),
      compound: ref.compound,
    };
  });
}

/** The reference rows for a set of words, in one query. */
export async function lookupReference(hanzi: string[]): Promise<Map<string, ReferenceWord>> {
  const wanted = [...new Set(hanzi.filter((h) => typeof h === "string" && h.length))];
  if (!wanted.length) return new Map();

  // Imported here so the reconciliation rules above stay importable — and
  // testable — without a database (db/client throws when DATABASE_URL is unset).
  const { db } = await import("../db/client.js");
  const rows = await db.select().from(hskWords).where(inArray(hskWords.zh, wanted));
  return new Map(rows.map((r) => [r.zh, {
    pinyin: r.pinyin, meaning: r.meaning, pos: r.pos, compound: r.compound, level: r.level,
  }]));
}
