ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "connect_charges_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "connect_payouts_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "connect_details_submitted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_connect_account_id_key" ON "subscriptions" ("stripe_connect_account_id") WHERE "stripe_connect_account_id" IS NOT NULL;
