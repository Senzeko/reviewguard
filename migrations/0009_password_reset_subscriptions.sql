CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_merchant_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."merchant_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user_id" ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_merchant_id_unique";
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "merchant_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_user_id_merchant_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."merchant_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_xor_owner_user_id" CHECK (
  ("merchant_id" IS NOT NULL AND "owner_user_id" IS NULL)
  OR ("merchant_id" IS NULL AND "owner_user_id" IS NOT NULL)
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_merchant_id_key" ON "subscriptions" ("merchant_id") WHERE "merchant_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_owner_user_id_key" ON "subscriptions" ("owner_user_id") WHERE "owner_user_id" IS NOT NULL;
