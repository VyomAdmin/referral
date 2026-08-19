"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals, referrers } from "../../db/schema.ts";
import { getDefaultOrganizationId } from "./organization.ts";
import { getOrCreateCampaignId } from "./campaign-directory.ts";
import { isValidPhone } from "./referral-rules.ts";
import { mintTrackerLinkAction } from "./tracker-actions.ts";

export type CustomerReferralInput = {
  referralCode: string;
  zip: string;
  state: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleMake?: string;
  vehicleYear?: string;
  vehicleModel?: string;
  insuranceProvider?: string;
  consent: boolean;
};

export type CustomerReferralResult = { referralId: string; trackPath: string } | { error: string };

export async function submitCustomerReferralAction(input: CustomerReferralInput): Promise<CustomerReferralResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || !isValidPhone(phone)) {
    return { error: "Complete every field with a valid email and a 10-digit mobile number." };
  }
  if (!input.consent) {
    return { error: "Please agree to the program terms to continue." };
  }

  const organizationId = await getDefaultOrganizationId();
  const db = getDb();

  const [referrer] = await db
    .select()
    .from(referrers)
    .where(and(eq(referrers.organizationId, organizationId), eq(referrers.code, input.referralCode)))
    .limit(1);
  if (!referrer) return { error: "This referral link is no longer valid." };

  const campaignId = await getOrCreateCampaignId(organizationId, input.state);
  if (!campaignId) return { error: "We don't yet support service in this area." };

  const id = crypto.randomUUID();
  await db.insert(referrals).values({
    id,
    organizationId,
    campaignId,
    referrerId: referrer.id,
    customerFirstName: firstName,
    customerLastName: lastName,
    customerEmail: email,
    customerPhone: phone,
    zip: input.zip,
    state: input.state,
    vehicleMake: input.vehicleMake || null,
    vehicleYear: input.vehicleYear || null,
    vehicleModel: input.vehicleModel || null,
    insuranceProvider: input.insuranceProvider || null,
    consentGivenAt: new Date(),
    publicStatus: "received",
  });

  const trackPath = await mintTrackerLinkAction("customer", { referralId: id });
  return { referralId: id, trackPath };
}
