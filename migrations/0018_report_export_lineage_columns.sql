--> statement-breakpoint
ALTER TABLE "podsignal_report_exports" ADD COLUMN IF NOT EXISTS "evidence_scores_json" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "podsignal_report_exports" ADD COLUMN IF NOT EXISTS "report_identifiers_json" jsonb NOT NULL DEFAULT '{}'::jsonb;
