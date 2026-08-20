import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals } from "../../db/schema.ts";
import { createContact, createDeal, findContactByEmailOrPhone, getDealStageLabel } from "./hubspot-client.ts";
import { INSTALLATION_COMPLETED_PROPERTY, INSTALLATION_COMPLETED_VALUE, mapHubSpotDealToPublicStatus } from "./hubspot.ts";
import type { HubSpotWebhookEvent } from "./hubspot.ts";

const LEAD_SOURCE = "Referral";

export async function syncReferralToHubSpot(referralId: string) {
  const db = getDb();
  const [referral] = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!referral) return;

  if (!process.env.HUBSPOT_PIPELINE_ID || !process.env.HUBSPOT_STAGE_NEW_ID) {
    await db.update(referrals).set({ syncStatus: "skipped" }).where(eq(referrals.id, referralId));
    return;
  }

  try {
    const contactId =
      referral.hubspotContactId ??
      (await findContactByEmailOrPhone(referral.customerEmail, referral.customerPhone)) ??
      (await createContact({
        firstName: referral.customerFirstName,
        lastName: referral.customerLastName,
        email: referral.customerEmail,
        phone: referral.customerPhone,
      }));

    if (contactId !== referral.hubspotContactId) {
      await db.update(referrals).set({ hubspotContactId: contactId }).where(eq(referrals.id, referralId));
    }

    const deal = await createDeal({
      contactId,
      dealName: `${referral.customerFirstName} ${referral.customerLastName} — ${referral.state} ${referral.zip}`,
      pipeline: process.env.HUBSPOT_PIPELINE_ID,
      dealstage: process.env.HUBSPOT_STAGE_NEW_ID,
      leadSource: LEAD_SOURCE,
    });
    const stageLabel = await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, deal.stage);

    await db
      .update(referrals)
      .set({
        hubspotContactId: contactId,
        hubspotDealId: deal.id,
        hubspotStage: stageLabel,
        syncStatus: "synced",
        hubspotSyncedAt: new Date(),
        hubspotSyncError: null,
      })
      .where(eq(referrals.id, referralId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HubSpot sync failure";
    console.error(`[hubspot-sync] referral ${referralId} failed:`, error);
    await db.update(referrals).set({ syncStatus: "failed", hubspotSyncError: message }).where(eq(referrals.id, referralId));
  }
}

export type ReferralDealState = { publicStatus: string; hubspotStage: string | null; installationCompletedAt: Date | null };
export type DealEventUpdate = { hubspotStage?: string; installationCompletedAt?: Date; publicStatus: string } | null;

// Pure decision: what should change on a referral given its current state and an
// inbound deal property-change event? `paid` is never produced here — that stays
// an internal admin decision — so a webhook can never regress a referral, and
// reward eligibility still requires the app's own installationCompletedAt on top
// of whatever HubSpot reports.
export function computeDealEventUpdate(referral: ReferralDealState, event: HubSpotWebhookEvent): DealEventUpdate {
  if (!event.propertyName || referral.publicStatus === "paid") return null;

  const updates: { hubspotStage?: string; installationCompletedAt?: Date } = {};
  if (event.propertyName === "dealstage" && event.propertyValue) {
    updates.hubspotStage = event.propertyValue;
  }
  if (event.propertyName === INSTALLATION_COMPLETED_PROPERTY && event.propertyValue === INSTALLATION_COMPLETED_VALUE && !referral.installationCompletedAt) {
    updates.installationCompletedAt = new Date(event.occurredAt);
  }
  if (Object.keys(updates).length === 0) return null;

  const nextStage = updates.hubspotStage ?? referral.hubspotStage ?? "";
  const nextInstallationCompletedAt = updates.installationCompletedAt ?? referral.installationCompletedAt;
  const publicStatus = mapHubSpotDealToPublicStatus({
    dealStage: nextStage,
    installationCompleted: Boolean(nextInstallationCompletedAt),
    installationCompletedAt: nextInstallationCompletedAt?.toISOString() ?? null,
    rewardPaid: false,
  });

  return { ...updates, publicStatus };
}

// Applies an inbound deal property-change event to the matching referral row.
// HubSpot's webhook payload carries the same opaque numeric stage id as the API,
// so a "dealstage" event is resolved to its label before the pure decision logic
// sees it — that logic expects text (it regex-matches on stage names).
export async function applyHubSpotDealEvent(event: HubSpotWebhookEvent) {
  const db = getDb();
  const [referral] = await db.select().from(referrals).where(eq(referrals.hubspotDealId, String(event.objectId))).limit(1);
  if (!referral) return;

  const resolvedEvent =
    event.propertyName === "dealstage" && event.propertyValue && process.env.HUBSPOT_PIPELINE_ID
      ? { ...event, propertyValue: await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, event.propertyValue) }
      : event;

  const update = computeDealEventUpdate(referral, resolvedEvent);
  if (!update) return;

  await db.update(referrals).set(update).where(eq(referrals.id, referral.id));
}
