ALTER TABLE "referrals" ADD COLUMN "hubspot_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "hubspot_sync_error" text;