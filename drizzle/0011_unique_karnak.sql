DROP INDEX "campaign_sms_templates_active_idx";--> statement-breakpoint
ALTER TABLE "campaign_sms_templates" ADD COLUMN "template_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_sms_templates_active_idx" ON "campaign_sms_templates" USING btree ("campaign_id","template_key") WHERE "campaign_sms_templates"."is_active" = true;