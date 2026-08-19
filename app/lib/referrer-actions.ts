"use server";

import { getDb } from "../../db/index.ts";
import { referrers } from "../../db/schema.ts";
import { getDefaultOrganizationId } from "./organization.ts";
import { createReferralCode, isValidPhone } from "./referral-rules.ts";
import { mintTrackerLinkAction } from "./tracker-actions.ts";

export type ReferrerRegistrationInput = { firstName: string; lastName: string; email: string; phone: string };

export type ReferrerRegistrationResult = { code: string; firstName: string; trackPath: string } | { error: string };

export async function submitReferrerRegistrationAction(input: ReferrerRegistrationInput): Promise<ReferrerRegistrationResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || !isValidPhone(phone)) {
    return { error: "Please complete every field with a valid email and a 10-digit mobile number." };
  }

  const organizationId = await getDefaultOrganizationId();
  const code = createReferralCode(firstName, lastName, Date.now());
  const id = crypto.randomUUID();

  await getDb().insert(referrers).values({ id, organizationId, code, firstName, lastName, email, phone, status: "active" });

  const trackPath = await mintTrackerLinkAction("referrer", { referrerId: id });
  return { code, firstName, trackPath };
}
