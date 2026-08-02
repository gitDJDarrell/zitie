ALTER TABLE "seen_state" ADD COLUMN "read_marks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "write_marks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "brush_marks" integer DEFAULT 0 NOT NULL;