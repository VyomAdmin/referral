"use server";

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaigns, referrals } from "../../db/schema.ts";
import type { AdminCampaign } from "./admin-queries.ts";
import type { AdminReferral } from "./admin-data";
import { auth, requireRole } from "./auth";
import { logAuditEvent } from "./audit";
import { getAdminReferrals } from "./admin-queries.ts";
import { reconcileReferralFromHubSpot, syncReferralToHubSpot } from "./hubspot-sync.ts";
import { REWARD_ROLES } from "./roles.ts";

export type MarkReferralPaidResult = { ok: true } | { ok: false; error: string };

export async function markReferralPaidAction(referralId: string): Promise<MarkReferralPaidResult> {
  const session = await auth();
  if (!session?.user?.organizationId || !requireRole(session, REWARD_ROLES)) {
    return { ok: false, error: "You don't have permission to process rewards." };
  }

  const organizationId = session.user.organizationId;
  const db = getDb();
  const [referral] = await db
    .select({ publicStatus: referrals.publicStatus, installationCompletedAt: referrals.installationCompletedAt })
    .from(referrals)
    .where(and(eq(referrals.id, referralId), eq(referrals.organizationId, organizationId)))
    .limit(1);

  // Re-check eligibility here, not just in the UI's disabled-button state — the
  // critical invariant (installation completed, not already paid) must hold
  // however this action gets called.
  if (!referral || referral.publicStatus !== "installed" || !referral.installationCompletedAt) {
    return { ok: false, error: "Payment is blocked until installation completion is confirmed." };
  }

  await db
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

export type UpdateCampaignInput = { id: string; name: string; offer: string | null; rewardCents: number; active: boolean };
export type UpdateCampaignResult = { ok: true; campaign: AdminCampaign } | { ok: false; error: string };

export async function updateCampaignAction(input: UpdateCampaignInput): Promise<UpdateCampaignResult> {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { ok: false, error: "You don't have permission to edit campaigns." };
  }
  if (!input.name.trim() || !Number.isFinite(input.rewardCents) || input.rewardCents < 0) {
    return { ok: false, error: "Enter a campaign name and a valid reward amount." };
  }

  const organizationId = session.user.organizationId;
  const db = getDb();
  const [updated] = await db
    .update(campaigns)
    .set({ name: input.name.trim(), customerOffer: input.offer?.trim() || null, referrerRewardCents: input.rewardCents, active: input.active })
    .where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organizationId)))
    .returning({ id: campaigns.id, state: campaigns.state, name: campaigns.name, offer: campaigns.customerOffer, rewardCents: campaigns.referrerRewardCents, active: campaigns.active });

  if (!updated) {
    return { ok: false, error: "Campaign not found." };
  }

  await logAuditEvent({
    actorId: session.user.id ?? "unknown",
    action: "campaign.updated",
    targetType: "campaign",
    targetId: input.id,
    organizationId,
    afterValue: updated,
  });

  return { ok: true, campaign: updated };
}
