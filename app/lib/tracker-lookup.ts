"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals, referrers } from "../../db/schema.ts";
import { getDefaultOrganizationId } from "./organization.ts";
import { createTrackerToken } from "./tracker-tokens.ts";
import { markTrackerVerified } from "./tracker-verification.ts";

export type TrackerLookupResult =
  | { ok: true; referrerTrack: string | null; customerTracks: { trackPath: string; state: string; zip: string }[] }
  | { ok: false; error: string };

export async function lookupTrackerLinksAction(email: string, phone: string): Promise<TrackerLookupResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const phoneLast4 = phone.replace(/\D/g, "").slice(-4);
  if (!normalizedEmail || phoneLast4.length !== 4) {
    return { ok: false, error: "Enter the email address and the last 4 digits of the phone number on file." };
  }

  const organizationId = await getDefaultOrganizationId();
  const db = getDb();

  const [referrer] = await db
    .select()
    .from(referrers)
    .where(and(eq(referrers.organizationId, organizationId), eq(referrers.email, normalizedEmail)))
    .limit(1);
  const referrerMatches = referrer && referrer.phone.replace(/\D/g, "").slice(-4) === phoneLast4;

  const referralRows = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.organizationId, organizationId), eq(referrals.customerEmail, normalizedEmail)));
  const customerMatches = referralRows.filter((row) => row.customerPhone.replace(/\D/g, "").slice(-4) === phoneLast4);

  if (!referrerMatches && customerMatches.length === 0) {
    return { ok: false, error: "We couldn't find a referral matching that email and phone number." };
  }

  let referrerTrack: string | null = null;
  if (referrerMatches) {
    const token = await createTrackerToken({ kind: "referrer", referrerId: referrer.id });
    await markTrackerVerified("referrer", token);
    referrerTrack = `/track/referrer/${token}`;
  }

  const customerTracks = await Promise.all(
    customerMatches.map(async (row) => {
      const token = await createTrackerToken({ kind: "customer", referralId: row.id });
      await markTrackerVerified("customer", token);
      return { trackPath: `/track/customer/${token}`, state: row.state, zip: row.zip };
    }),
  );

  return { ok: true, referrerTrack, customerTracks };
}
