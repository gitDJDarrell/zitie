import type { seenState } from "../db/schema.js";

/**
 * The wire shape of a seen_state row — timestamps flattened to epoch millis.
 *
 * Deliberately the single definition, imported by every route that hands a
 * seen record to the client. It used to be written out longhand in both
 * GET /cards and POST /seen/grade, and the two drifted: the grade response
 * grew readOk/writeOk when dex proofs landed, the bank load didn't, and so
 * every earned proof vanished on the next page load. A column added to the
 * table now reaches the client from one place or neither.
 */
export function serializeSeen(row: typeof seenState.$inferSelect) {
  return {
    last: row.last.getTime(),
    views: row.views,
    ease: row.ease,
    intervalDays: row.intervalDays,
    due: row.due ? row.due.getTime() : null,
    reps: row.reps,
    lapses: row.lapses,
    lastGrade: row.lastGrade,
    readOk: row.readOk,
    writeOk: row.writeOk,
    brushOk: row.brushOk,
  };
}

export type SeenWire = ReturnType<typeof serializeSeen>;
