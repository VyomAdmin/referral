CREATE TABLE "non_serviceable_zip_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"zip" text NOT NULL,
	"referrer_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "non_serviceable_zip_attempts" ADD CONSTRAINT "non_serviceable_zip_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;