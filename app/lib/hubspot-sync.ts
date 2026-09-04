import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals, referrers } from "../../db/schema.ts";
import { createContact, createDeal, findContactByEmailOrPhone, getDealProperties, getDealStageLabel, resolvePicklistValue } from "./hubspot-client.ts";
import { INSTALLATION_COMPLETED_PROPERTY, INSTALLATION_COMPLETED_VALUE, mapHubSpotDealToPublicStatus } from "./hubspot.ts";
import type { HubSpotWebhookEvent } from "./hubspot.ts";
import { notifyOps } from "./ops-alerts.ts";
import { stateName } from "./referral-rules.ts";
import { notifyReferrerOfReferralStatus } from "./referrer-notifications.ts";

const LEAD_SOURCE = "In-House Referral";
const SECONDARY_LEAD_SOURCE = "Marketing";

// Resolves each candidate value against its HubSpot property (matching
// picklists case-insensitively, passing free-text fields through as-is) and
// splits the results into properties HubSpot will accept vs. a human-readable
// notes line for anything a picklist rejected — so an unrecognized value
// (a make HubSpot doesn't have an option for, a typo, etc.) lands somewhere
// visible on the deal instead of silently failing the whole sync.
export async function resolveDealFields(candidates: { property: string; value: string | null | undefined }[]): Promise<{ properties: Record<string, string>; notes: string }> {
  const properties: Record<string, string> = {};
  const notesLines: string[] = [];

  for (const { property, value } of candidates) {
    if (!value) continue;
    const resolution = await resolvePicklistValue("deals", property, value);
    if (resolution.kind === "matched") {
      properties[property] = resolution.value;
    } else if (resolution.kind === "not-a-picklist") {
      properties[property] = value;
    } else {
      notesLines.push(`${resolution.fieldLabel}: ${value}`);
    }
  }

  return { properties, notes: notesLines.join("\n") };
}

export async function syncReferralToHubSpot(referralId: string) {
  const db = getDb();
  const [referral] = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!referral) return;

  const [referrer] = await db.select({ code: referrers.code }).from(referrers).where(eq(referrers.id, referral.referrerId)).limit(1);
  const referralCode = referrer?.code ?? "";

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
        leadSource: LEAD_SOURCE,
        secondaryLeadSource: SECONDARY_LEAD_SOURCE,
        referralCode: referralCode,
      }));

    if (contactId !== referral.hubspotContactId) {
      await db.update(referrals).set({ hubspotContactId: contactId }).where(eq(referrals.id, referralId));
    }

    const { properties: dealFieldProperties, notes: installNotes } = await resolveDealFields([
      { property: "install_state", value: stateName(referral.state as "AZ" | "FL") },
      { property: "install_zip", value: referral.zip },
      { property: "year__c", value: referral.vehicleYear },
      { property: "veh_make__c", value: referral.vehicleMake },
      { property: "model__c", value: referral.vehicleModel },
      { property: "insurance_provider_2", value: referral.insuranceProvider },
    ]);

    const deal = await createDeal({
      contactId,
      dealName: `${referral.customerFirstName} ${referral.customerLastName} — ${referral.state} ${referral.zip}`,
      pipeline: process.env.HUBSPOT_PIPELINE_ID,
      dealstage: process.env.HUBSPOT_STAGE_NEW_ID,
      leadSource: LEAD_SOURCE,
      secondaryLeadSource: SECONDARY_LEAD_SOURCE,
      referralCode: referralCode,
      contactPhone: referral.customerPhone,
      extraProperties: dealFieldProperties,
      installNotes: installNotes || undefined,
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
    await notifyOps({
      type: "hubspot_sync_failed",
      summary: `HubSpot sync failed for referral ${referralId}: ${message}`,
      context: { referralId, customerEmail: referral.customerEmail },
    });
  }
}

export type ReferralDealState = { publicStatus: string; hubspotStage: string | null; installationCompletedAt: Date | null };
export type DealEventUpdate = { hubspotStage?: string; installationCompletedAt?: Date; publicStatus: string } | null;

const PUBLIC_STATUS_RANK: Record<string, number> = { received: 0, scheduled: 1, installed: 2, paid: 3 };

// The internal hubspotStage record always reflects HubSpot's true current
// state, but the customer-facing publicStatus never moves backward — a rep
// correcting a deal stage in HubSpot shouldn't make a customer's tracker
// regress from "installed" back to "received".
function clampPublicStatus(current: string, computed: string): string {
  const currentRank = PUBLIC_STATUS_RANK[current] ?? 0;
  const computedRank = PUBLIC_STATUS_RANK[computed] ?? 0;
  return computedRank >= currentRank ? computed : current;
}

// Pure decision: what should change on a referral given its current state and an
// inbound deal property-change event? `paid` is never produced here — that stays
// an internal admin decision — and publicStatus is clamped so a webhook can
// never regress it, so reward eligibility still requires the app's own
// installationCompletedAt on top of whatever HubSpot reports.
export function computeDealEventUpdate(referral: ReferralDealState, event: Pick<HubSpotWebhookEvent, "propertyName" | "propertyValue" | "occurredAt">): DealEventUpdate {
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
  const computedStatus = mapHubSpotDealToPublicStatus({
    dealStage: nextStage,
    installationCompleted: Boolean(nextInstallationCompletedAt),
    installationCompletedAt: nextInstallationCompletedAt?.toISOString() ?? null,
    rewardPaid: false,
  });

  return { ...updates, publicStatus: clampPublicStatus(referral.publicStatus, computedStatus) };
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
  if (update.publicStatus !== referral.publicStatus) {
    notifyReferrerOfReferralStatus(referral, update.publicStatus).catch(() => {});
  }
}

// Backstop for the webhook: pulls the deal's current dealstage and
// installation-completed signal directly from HubSpot and applies whatever
// changed. Webhooks only fire on changes made after a subscription is created,
// so a property set before (or without) a working subscription never arrives
// as an event — this lets an already-synced referral catch up on demand.
export async function reconcileReferralFromHubSpot(referralId: string) {
  const db = getDb();
  const [referral] = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!referral?.hubspotDealId || referral.publicStatus === "paid") return;

  const properties = await getDealProperties(referral.hubspotDealId, ["dealstage", INSTALLATION_COMPLETED_PROPERTY]);
  let state: ReferralDealState = { publicStatus: referral.publicStatus, hubspotStage: referral.hubspotStage, installationCompletedAt: referral.installationCompletedAt };
  let combined: NonNullable<DealEventUpdate> | Record<string, never> = {};

  const rawStage = properties.dealstage;
  if (rawStage) {
    const stageLabel = process.env.HUBSPOT_PIPELINE_ID ? await getDealStageLabel(process.env.HUBSPOT_PIPELINE_ID, rawStage) : rawStage;
    const stageUpdate = computeDealEventUpdate(state, { propertyName: "dealstage", propertyValue: stageLabel, occurredAt: Date.now() });
    if (stageUpdate) {
      combined = { ...combined, ...stageUpdate };
      state = { ...state, hubspotStage: stageUpdate.hubspotStage ?? state.hubspotStage, publicStatus: stageUpdate.publicStatus };
    }
  }

  const statusCode = properties[INSTALLATION_COMPLETED_PROPERTY];
  if (statusCode) {
    const installUpdate = computeDealEventUpdate(state, { propertyName: INSTALLATION_COMPLETED_PROPERTY, propertyValue: statusCode, occurredAt: Date.now() });
    if (installUpdate) combined = { ...combined, ...installUpdate };
  }

  if (Object.keys(combined).length > 0) {
    await db.update(referrals).set(combined).where(eq(referrals.id, referralId));
    if ("publicStatus" in combined && combined.publicStatus !== referral.publicStatus) {
      notifyReferrerOfReferralStatus(referral, combined.publicStatus).catch(() => {});
    }
  }
}
