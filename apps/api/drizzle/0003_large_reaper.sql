CREATE TABLE "character_insights" (
	"hanzi" text PRIMARY KEY NOT NULL,
	"structure" text,
	"ety_type" text,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story" text,
	"compounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
