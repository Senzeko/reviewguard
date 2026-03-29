--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_output_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "episodes"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_output_usage_user" ON "podsignal_output_usage" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_output_usage_episode" ON "podsignal_output_usage" ("episode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_output_usage_created" ON "podsignal_output_usage" ("created_at");
