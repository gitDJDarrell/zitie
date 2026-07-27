CREATE TABLE "hsk_words" (
	"zh" text PRIMARY KEY NOT NULL,
	"pinyin" text,
	"meaning" text,
	"level" text NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compound" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hsk_words_level_idx" ON "hsk_words" USING btree ("level");