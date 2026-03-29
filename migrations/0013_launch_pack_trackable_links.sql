--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "launch_pack" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_trackable_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "merchant_users"("id") ON DELETE CASCADE,
  "episode_id" uuid NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "asset_kind" text NOT NULL,
  "channel" text,
  "target_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_podsignal_trackable_links_token" ON "podsignal_trackable_links" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_trackable_links_episode" ON "podsignal_trackable_links" ("episode_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podsignal_link_clicks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL REFERENCES "podsignal_trackable_links"("id") ON DELETE CASCADE,
  "clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "referer" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_link_clicks_link" ON "podsignal_link_clicks" ("link_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_podsignal_link_clicks_clicked" ON "podsignal_link_clicks" ("clicked_at");
