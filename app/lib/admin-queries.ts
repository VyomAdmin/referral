import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaigns, referrals, referrers } from "../../db/schema.ts";
import type { AdminReferral } from "./admin-data";

export async function getAdminReferrals(organizationId: string): Promise<AdminReferral[]> {
  const rows = await getDb()
    .select({
      id: referrals.id,
      code: referrers.code,
      referrerFirstName: referrers.firstName,
      referrerLastName: referrers.lastName,
      referrerEmail: referrers.email,
      customerFirstName: referrals.customerFirstName,
      customerLastName: referrals.customerLastName,
      customerEmail: referrals.customerEmail,
      phone: referrals.customerPhone,
      state: referrals.state,
      zip: referrals.zip,
      status: referrals.publicStatus,
      hubspotDealId: referrals.hubspotDealId,
      hubspotStage: referrals.hubspotStage,
      submittedAt: referrals.createdAt,
      installationCompletedAt: referrals.installationCompletedAt,
      referrerRewardCents: campaigns.referrerRewardCents,
      syncStatus: referrals.syncStatus,
    })
    .from(referrals)
    .innerJoin(referrers, eq(referrals.referrerId, referrers.id))
    .leftJoin(campaigns, eq(referrals.campaignId, campaigns.id))
    .where(eq(referrals.organizationId, organizationId))
    .orderBy(desc(referrals.createdAt));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    referrer: `${row.referrerFirstName} ${row.referrerLastName}`,
    referrerEmail: row.referrerEmail,
    customer: `${row.customerFirstName} ${row.customerLastName}`,
    customerEmail: row.customerEmail,
    phone: row.phone,
    state: row.state as AdminReferral["state"],
    zip: row.zip,
    status: row.status as AdminReferral["status"],
    hubspotDealId: row.hubspotDealId ?? "—",
    hubspotStage: row.hubspotStage ?? "—",
    submittedAt: row.submittedAt.toISOString(),
    installedAt: row.installationCompletedAt ? row.installationCompletedAt.toISOString() : null,
    rewardAmount: (row.referrerRewardCents ?? 5000) / 100,
    syncStatus: (row.syncStatus as AdminReferral["syncStatus"]) ?? "pending",
  }));
}
