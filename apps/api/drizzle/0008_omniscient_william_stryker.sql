CREATE TABLE "character_strokes" (
	"hanzi" text PRIMARY KEY NOT NULL,
	"strokes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"medians" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "brush_ok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Collection now wants three proofs rather than two, and raising the bar
-- retroactively would empty galleries that were legitimately filled under the
-- old rule. Anything already collected keeps its slot; only characters earned
-- from here on have to be brushed as well. Same reasoning as 0007's backfill:
-- the change is meant to be felt going forward, not applied to the past.
UPDATE "seen_state" SET "brush_ok" = true WHERE "read_ok" AND "write_ok";