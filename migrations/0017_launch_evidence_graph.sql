--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_asset_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "podcast_id" uuid REFERENCES "podcasts"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "episodes"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "asset_type" text NOT NULL,
  "channel" text,
  "variant_key" text NOT NULL DEFAULT '',
  "content_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_generation_version" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_asset_variants_owner" ON "podsignal_asset_variants" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_asset_variants_episode" ON "podsignal_asset_variants" ("episode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_asset_variants_campaign" ON "podsignal_asset_variants" ("campaign_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_launch_windows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "window_type" text NOT NULL DEFAULT 'custom',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_launch_windows_episode" ON "podsignal_launch_windows" ("episode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_launch_windows_owner" ON "podsignal_launch_windows" ("owner_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_performance_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "episodes"("id") ON DELETE SET NULL,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "snapshot_type" text NOT NULL DEFAULT 'other',
  "metric_name" text NOT NULL,
  "metric_value" bigint NOT NULL,
  "captured_at" timestamp with time zone NOT NULL DEFAULT now(),
  "evidence_class" text NOT NULL DEFAULT 'proxy',
  "notes" text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_perf_snap_episode" ON "podsignal_performance_snapshots" ("episode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_perf_snap_owner" ON "podsignal_performance_snapshots" ("owner_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_guest_topic_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "episode_id" uuid NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "guest_name" text,
  "guest_org" text,
  "topic_label" text,
  "confidence" text NOT NULL DEFAULT 'medium',
  "source" text NOT NULL DEFAULT 'manual'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_guest_topic_episode" ON "podsignal_guest_topic_links" ("episode_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_report_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "episodes"("id") ON DELETE SET NULL,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "report_type" text NOT NULL DEFAULT 'sponsor_proof',
  "export_format" text NOT NULL,
  "exported_by" uuid REFERENCES "merchant_users"("id") ON DELETE SET NULL,
  "exported_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_report_exports_owner" ON "podsignal_report_exports" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_report_exports_episode" ON "podsignal_report_exports" ("episode_id");
