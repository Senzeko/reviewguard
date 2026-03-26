ALTER TYPE "public"."match_status" ADD VALUE 'PROCESSING';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "clover_merchant_id" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "last_sync_at" timestamp with time zone;