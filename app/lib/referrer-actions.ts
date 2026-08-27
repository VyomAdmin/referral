"use server";

import { getDb } from "../../db/index.ts";
import { referrers } from "../../db/schema.ts";
import { getDefaultOrganizationId } from "./organization.ts";
import { checkRateLimit, getClientIp } from "./rate-limit.ts";
import { createReferralCode, isValidEmail, isValidPhone } from "./referral-rules.ts";
import { notifyReferrer } from "./referrer-notifications.ts";
import { mintTrackerLinkAction } from "./tracker-actions.ts";

const MAX_SIGNUPS_PER_WINDOW = 5;
const SIGNUP_WINDOW_MINUTES = 10;

export type ReferrerRegistrationInput = { firstName: string; lastName: string; email: string; phone: string };

export type ReferrerRegistrationResult = { code: string; firstName: string; trackPath: string } | { error: string };

export async function submitReferrerRegistrationAction(input: ReferrerRegistrationInput): Promise<ReferrerRegistrationResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!firstName || !lastName || !isValidEmail(email) || !isValidPhone(phone)) {
    return { error: "Please complete every field with a valid email and a 10-digit mobile number." };
  }

  const clientIp = await getClientIp();
  const withinLimit = await checkRateLimit(`referrer-signup:${clientIp}`, MAX_SIGNUPS_PER_WINDOW, SIGNUP_WINDOW_MINUTES);
  if (!withinLimit) {
    return { error: "Too many signups from this connection. Please try again in a few minutes." };
  }

  const organizationId = await getDefaultOrganizationId();
  const code = createReferralCode(firstName, lastName, Date.now());
  const id = crypto.randomUUID();

  await getDb().insert(referrers).values({ id, organizationId, code, firstName, lastName, email, phone, status: "active" });

  const trackPath = await mintTrackerLinkAction("referrer", { referrerId: id });
  notifyReferrer("referrer_welcome", { id, organizationId, firstName, lastName, email, phone, code }).catch(() => {});
  return { code, firstName, trackPath };
}
