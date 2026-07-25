ALTER TABLE "seen_state" ADD COLUMN "ease" real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "interval_days" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "due" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "reps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seen_state" ADD COLUMN "lapses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "auto_speak" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "difficulty" integer DEFAULT 2 NOT NULL;