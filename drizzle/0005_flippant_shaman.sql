CREATE TABLE "verification_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_key" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
