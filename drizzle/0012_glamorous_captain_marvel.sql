-- Deduplicate referrer emails, then enforce uniqueness.
--
-- Signing up twice used to mint a second referrer row with a SECOND referral
-- code for the same person, so they could be sharing code A while their
-- friend's referral landed on code B — split attribution and a disputed
-- payout. submitReferrerRegistrationAction now returns the existing code, but
-- the rows already created during testing have to be separated before a unique
-- index can exist.
--
-- The oldest row per (organization_id, email) keeps the address unchanged — it
-- owns the code that has actually been shared. Every later row gets "-dupN"
-- appended, oldest first, which both frees the email and marks the row as a
-- duplicate rather than deleting referral history that points at it.
--
-- Ordering matters: this UPDATE must run BEFORE the CREATE UNIQUE INDEX in the
-- same migration. scripts/start.sh runs `npm run db:migrate` before
-- `npm start`, so an index that fails on existing data doesn't get skipped —
-- it stops the service from starting.
UPDATE "referrers" AS r
SET "email" = CASE
  -- Normally just "<email>-dupN". The guard covers the one way that could
  -- still collide: a row whose address is already literally the generated
  -- value. There are none today, and this keeps the index creation below
  -- unable to fail rather than relying on that staying true.
  WHEN NOT EXISTS (
    SELECT 1 FROM "referrers" x
    WHERE x."organization_id" = r."organization_id"
      AND x."email" = r."email" || '-dup' || (k.rn - 1)
  ) THEN r."email" || '-dup' || (k.rn - 1)
  ELSE r."email" || '-dup' || (k.rn - 1) || '-' || left(r."id", 8)
END
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id", "email"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "referrers"
) AS k
WHERE r."id" = k."id" AND k.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "referrer_org_email_idx" ON "referrers" USING btree ("organization_id","email");
