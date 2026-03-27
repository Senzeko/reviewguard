DO $$ BEGIN
 CREATE TYPE "public"."episode_status" AS ENUM('DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."signal_type" AS ENUM('HIGHLIGHT', 'TOPIC_SHIFT', 'QUOTE', 'QUESTION', 'AD_BREAK', 'INTRO', 'OUTRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"signal_id" uuid,
	"title" text NOT NULL,
	"start_sec" integer NOT NULL,
	"end_sec" integer NOT NULL,
	"clip_url" text,
	"transcript_snippet" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"audio_url" text,
	"duration_seconds" integer,
	"episode_number" integer,
	"season_number" integer,
	"transcript" text,
	"summary" text,
	"chapters" jsonb,
	"status" "episode_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"artwork_url" text,
	"rss_feed_url" text,
	"spotify_id" text,
	"apple_podcast_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"type" "signal_type" NOT NULL,
	"start_sec" integer NOT NULL,
	"end_sec" integer NOT NULL,
	"confidence" integer NOT NULL,
	"label" text NOT NULL,
	"transcript_snippet" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clips" ADD CONSTRAINT "clips_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clips" ADD CONSTRAINT "clips_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_owner_id_merchant_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."merchant_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signals" ADD CONSTRAINT "signals_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clips_episode_id" ON "clips" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episodes_podcast_id" ON "episodes" USING btree ("podcast_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episodes_status" ON "episodes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episodes_published_at" ON "episodes" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_signals_episode_id" ON "signals" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_signals_type" ON "signals" USING btree ("type");