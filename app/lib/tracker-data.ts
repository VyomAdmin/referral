import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaigns, referrals, referrers } from "../../db/schema.ts";

export async function getReferrerTrackerData(referrerId: string) {
  const db = getDb();
  const [referrer] = await db.select().from(referrers).where(eq(referrers.id, referrerId)).limit(1);
  if (!referrer) return null;

  const rows = await db
    .select({
      id: referrals.id,
      customerFirstName: referrals.customerFirstName,
      customerLastName: referrals.customerLastName,
      state: referrals.state,
      zip: referrals.zip,
      status: referrals.publicStatus,
      createdAt: referrals.createdAt,
      referrerRewardCents: campaigns.referrerRewardCents,
    })
    .from(referrals)
    .leftJoin(campaigns, eq(referrals.campaignId, campaigns.id))
    .where(eq(referrals.referrerId, referrerId))
    .orderBy(desc(referrals.createdAt));

  const installed = rows.filter((row) => row.status === "installed" || row.status === "paid").length;
  const rewardsEarnedCents = rows.filter((row) => row.status === "paid").reduce((sum, row) => sum + (row.referrerRewardCents ?? 0), 0);

  return { referrer, referrals: rows, totals: { total: rows.length, installed, rewardsEarnedCents } };
}

export async function getCustomerTrackerData(referralId: string) {
  const [row] = await getDb()
    .select({
      id: referrals.id,
      customerFirstName: referrals.customerFirstName,
      zip: referrals.zip,
      state: referrals.state,
      status: referrals.publicStatus,
      createdAt: referrals.createdAt,
      vehicleMake: referrals.vehicleMake,
      vehicleYear: referrals.vehicleYear,
      vehicleModel: referrals.vehicleModel,
      referrerFirstName: referrers.firstName,
      customerOffer: campaigns.customerOffer,
    })
    .from(referrals)
    .innerJoin(referrers, eq(referrals.referrerId, referrers.id))
    .leftJoin(campaigns, eq(referrals.campaignId, campaigns.id))
    .where(eq(referrals.id, referralId))
    .limit(1);

  return row ?? null;
}
