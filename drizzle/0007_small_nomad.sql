CREATE TABLE "campaign_email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_sms_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"referral_id" text,
	"referrer_id" text,
	"template_id" text,
	"template_key" text NOT NULL,
	"recipient" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "campaign_email_templates" ADD CONSTRAINT "campaign_email_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_sms_templates" ADD CONSTRAINT "campaign_sms_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_referrer_id_referrers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."referrers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_template_id_campaign_sms_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."campaign_sms_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_email_templates_active_idx" ON "campaign_email_templates" USING btree ("campaign_id") WHERE "campaign_email_templates"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_sms_templates_active_idx" ON "campaign_sms_templates" USING btree ("campaign_id") WHERE "campaign_sms_templates"."is_active" = true;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_template_id_campaign_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."campaign_email_templates"("id") ON DELETE no action ON UPDATE no action;