CREATE TABLE "character_audio" (
	"hanzi" text NOT NULL,
	"phoneme" text NOT NULL,
	"pinyin" text NOT NULL,
	"voice" text NOT NULL,
	"mime" text DEFAULT 'audio/mpeg' NOT NULL,
	"audio" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "character_audio_key" ON "character_audio" USING btree ("hanzi","phoneme");