"use server";

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals } from "../../db/schema.ts";
import type { AdminReferral } from "./admin-data";
import { auth } from "./auth";
import { logAuditEvent } from "./audit";
import { getAdminReferrals } from "./admin-queries.ts";
import { reconcileReferralFromHubSpot, syncReferralToHubSpot } from "./hubspot-sync.ts";

export type MarkReferralPaidResult = { ok: true } | { ok: false; error: string };

export async function markReferralPaidAction(referralId: string): Promise<MarkReferralPaidResult> {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { ok: false, error: "You don't have permission to process rewards." };
  }

  const organizationId = session.user.organizationId;
  await getDb()
    .update(referrals)
    .set({ publicStatus: "paid" })
    .where(and(eq(referrals.id, referralId), eq(referrals.organizationId, organizationId)));

  await logAuditEvent({
    actorId: session.user.id ?? "unknown",
    action: "referral.reward_paid",
    targetType: "referral",
    targetId: referralId,
    organizationId,
  });

  return { ok: true };
}

export type RetryHubSpotSyncsResult = { ok: true; retried: number; referrals: AdminReferral[] } | { ok: false; error: string };

export async function retryHubSpotSyncsAction(): Promise<RetryHubSpotSyncsResult> {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { ok: false, error: "You don't have permission to retry HubSpot syncs." };
  }

  const organizationId = session.user.organizationId;
  const pending = await getDb()
    .select({ id: referrals.id })
    .from(referrals)
    .where(and(eq(referrals.organizationId, organizationId), ne(referrals.syncStatus, "synced")));

  for (const { id } of pending) {
    await syncReferralToHubSpot(id);
  }

  // Also pull fresh state for already-synced deals: webhooks only fire on
  // changes made after the subscription existed, so this is the backstop for
  // anything HubSpot never told us about.
  const synced = await getDb()
    .select({ id: referrals.id })
    .from(referrals)
    .where(and(eq(referrals.organizationId, organizationId), eq(referrals.syncStatus, "synced")));

  for (const { id } of synced) {
    await reconcileReferralFromHubSpot(id);
  }

  if (pending.length > 0) {
    await logAuditEvent({
      actorId: session.user.id ?? "unknown",
      action: "hubspot.sync_retried",
      targetType: "referral_batch",
      targetId: `${pending.length} referrals`,
      organizationId,
      afterValue: { referralIds: pending.map((row) => row.id) },
    });
  }

  return { ok: true, retried: pending.length, referrals: await getAdminReferrals(organizationId) };
}
