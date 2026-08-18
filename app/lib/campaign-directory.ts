"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaigns } from "../../db/schema.ts";
import { supportedCampaigns } from "./referral-rules";

// Campaign rows are provisioned lazily from the static state-offer rules the first
// time a state is referenced, so the always-current copy in referral-rules.ts stays
// the single source of truth instead of drifting from hand-seeded database rows.
export async function getOrCreateCampaignId(organizationId: string, state: string) {
  const db = getDb();
  const [existing] = await db.select().from(campaigns).where(and(eq(campaigns.organizationId, organizationId), eq(campaigns.state, state))).limit(1);
  if (existing) return existing.id;

  const seed = supportedCampaigns.find((campaign) => campaign.state === state);
  if (!seed) return null;

  const id = crypto.randomUUID();
  await db.insert(campaigns).values({
    id,
    organizationId,
    name: seed.campaignName,
    state: seed.state,
    customerOffer: seed.customerOffer,
    referrerRewardCents: seed.referrerReward * 100,
    serviceMessage: seed.serviceMessage,
    zipRule: seed.state,
  });
  return id;
}
