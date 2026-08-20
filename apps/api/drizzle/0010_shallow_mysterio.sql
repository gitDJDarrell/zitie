CREATE TABLE "wallet" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"packs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"since_epic" integer DEFAULT 0 NOT NULL,
	"since_legendary" integer DEFAULT 0 NOT NULL,
	"tier_band" text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "rarity" text DEFAULT 'common' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "source" text DEFAULT 'pack' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;