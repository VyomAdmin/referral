"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrers } from "../../db/schema.ts";
import { syncReferrerToHubSpot } from "./hubspot-sync.ts";

// Postgres unique-violation SQLSTATE, surfaced by node-postgres as `code`.
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
import { getDefaultOrganizationId } from "./organization.ts";
import { checkRateLimit, getClientIp } from "./rate-limit.ts";
import { createReferralCode, isValidEmail, isValidPhone } from "./referral-rules.ts";
import { referrerConsentText } from "./consent.ts";
import { notifyReferrer } from "./referrer-notifications.ts";
import { mintTrackerLinkAction } from "./tracker-actions.ts";

const MAX_SIGNUPS_PER_WINDOW = 5;
const SIGNUP_WINDOW_MINUTES = 10;

export type ReferrerRegistrationInput = { firstName: string; lastName: string; email: string; phone: string; consent?: boolean };

export type ReferrerRegistrationResult = { code: string; firstName: string; trackPath: string; existing?: boolean } | { error: string };

export async function submitReferrerRegistrationAction(input: ReferrerRegistrationInput): Promise<ReferrerRegistrationResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!firstName || !lastName || !isValidEmail(email) || !isValidPhone(phone)) {
    return { error: "Please complete every field with a valid email and a 10-digit mobile number." };
  }
  // Checked server-side, not just in the browser: an unticked box that still
  // creates a referrer would leave us with a payout obligation and no record
  // of the terms being accepted.
  if (!input.consent) {
    return { error: "Please agree to the Referral Program Terms to continue." };
  }

  const clientIp = await getClientIp();
  const withinLimit = await checkRateLimit(`referrer-signup:${clientIp}`, MAX_SIGNUPS_PER_WINDOW, SIGNUP_WINDOW_MINUTES);
  if (!withinLimit) {
    return { error: "Too many signups from this connection. Please try again in a few minutes." };
  }

  const organizationId = await getDefaultOrganizationId();
  const db = getDb();

  // One person, one referral code. Without this, signing up twice minted a
  // second code for the same email — so they might share code A while their
  // friend's referral lands on code B, splitting attribution and the payout.
  // Returning the existing code is also the friendlier behaviour: someone who
  // forgot they'd joined just gets their link back.
  const [existing] = await db
    .select({ id: referrers.id, code: referrers.code, firstName: referrers.firstName })
    .from(referrers)
    .where(and(eq(referrers.organizationId, organizationId), eq(referrers.email, email)))
    .limit(1);
  if (existing) {
    const trackPath = await mintTrackerLinkAction("referrer", { referrerId: existing.id });
    return { code: existing.code, firstName: existing.firstName, trackPath, existing: true };
  }

  const code = createReferralCode(firstName, lastName, Date.now());
  const id = crypto.randomUUID();

  // The pre-check above handles the ordinary case; this catches the race the
  // referrer_org_email_idx index now rejects — two submits of the same form
  // landing together. Recover the row that won instead of surfacing a 500.
  try {
    await insertReferrer();
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [winner] = await db
        .select({ id: referrers.id, code: referrers.code, firstName: referrers.firstName })
        .from(referrers)
        .where(and(eq(referrers.organizationId, organizationId), eq(referrers.email, email)))
        .limit(1);
      if (winner) {
        const trackPath = await mintTrackerLinkAction("referrer", { referrerId: winner.id });
        return { code: winner.code, firstName: winner.firstName, trackPath, existing: true };
      }
    }
    throw error;
  }

  async function insertReferrer() {
    return db.insert(referrers).values({
    id,
    organizationId,
    code,
    firstName,
    lastName,
    email,
    phone,
      status: "active",
      // Consent evidence: when, from where, and the exact wording shown.
      consentGivenAt: new Date(),
      consentIp: clientIp,
      consentText: referrerConsentText(),
    });
  }

  const trackPath = await mintTrackerLinkAction("referrer", { referrerId: id });
  notifyReferrer("referrer_welcome", { id, organizationId, firstName, lastName, email, phone, code }).catch(() => {});
  // Best-effort: a HubSpot outage must not fail the signup.
  syncReferrerToHubSpot(id).catch(() => {});
  return { code, firstName, trackPath };
}
