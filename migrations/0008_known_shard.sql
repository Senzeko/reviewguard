DO $$ BEGIN
 ALTER TYPE "public"."episode_status" ADD VALUE 'FAILED' BEFORE 'PUBLISHED';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"speaker" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "audio_local_rel_path" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "processing_error" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "audio_mime_type" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transcript_segments_episode_id" ON "transcript_segments" USING btree ("episode_id");