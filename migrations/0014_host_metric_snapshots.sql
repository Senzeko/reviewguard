--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_host_metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "episodes"("id") ON DELETE SET NULL,
  "metric_key" text NOT NULL,
  "custom_label" text,
  "value" bigint NOT NULL,
  "source_note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_host_metrics_user" ON "podsignal_host_metric_snapshots" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_host_metrics_created" ON "podsignal_host_metric_snapshots" ("created_at");
