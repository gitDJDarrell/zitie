ALTER TABLE "seen_state" ADD COLUMN "read_ok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "write_ok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Grandfather what was already earned. Under the old rule a dex slot was
-- filled by owning a card; from here it is filled by proving the character in
-- both directions. A card that was only ever imported loses its slot on
-- purpose — that is the point of the change — but a card someone has actually
-- passed a review on was studied in good faith under the old rules, and taking
-- its slot away retroactively would read as data loss rather than as a game.
UPDATE "seen_state" SET "read_ok" = true, "write_ok" = true WHERE "reps" > 0;