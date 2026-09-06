DROP INDEX "campaign_email_templates_active_idx";--> statement-breakpoint
ALTER TABLE "campaign_email_templates" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "referrers" ADD COLUMN "consent_given_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrers" ADD COLUMN "consent_ip" text;--> statement-breakpoint
ALTER TABLE "referrers" ADD COLUMN "consent_text" text;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_email_templates_active_idx" ON "campaign_email_templates" USING btree ("campaign_id","template_key") WHERE "campaign_email_templates"."is_active" = true;