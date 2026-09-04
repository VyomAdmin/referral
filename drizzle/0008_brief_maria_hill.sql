ALTER TABLE "referrals" ADD COLUMN "paid_by_user_id" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "paid_by_name" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "paid_at" timestamp with time zone;