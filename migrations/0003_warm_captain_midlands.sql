ALTER TABLE "reviews_investigation" ADD COLUMN "pdf_path" text;--> statement-breakpoint
ALTER TABLE "reviews_investigation" ADD COLUMN "pdf_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews_investigation" ADD COLUMN "case_id" text;