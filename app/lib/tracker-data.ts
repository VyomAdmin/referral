import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaigns, referrals, referrers } from "../../db/schema.ts";
import { createTrackerToken } from "./tracker-tokens.ts";

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
  const db = getDb();
  const [row] = await db
    .select({
      id: referrals.id,
      organizationId: referrals.organizationId,
      customerFirstName: referrals.customerFirstName,
      customerEmail: referrals.customerEmail,
      customerPhone: referrals.customerPhone,
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

  if (!row) return null;

  // A customer can be referred more than once (different referrers, or the
  // same one twice) — each submission gets its own tracker token/page, so
  // without this a returning visitor only ever sees the one order their
  // current link points at. Matched by email+phone, same as the /track
  // lookup form, since that's the only identity a referee has (no login).
  const siblingRows = await db
    .select({ id: referrals.id, state: referrals.state, zip: referrals.zip, status: referrals.publicStatus, createdAt: referrals.createdAt })
    .from(referrals)
    .where(
      and(
        eq(referrals.organizationId, row.organizationId),
        eq(referrals.customerEmail, row.customerEmail),
        eq(referrals.customerPhone, row.customerPhone),
        ne(referrals.id, row.id),
      ),
    )
    .orderBy(desc(referrals.createdAt));

  const otherOrders = await Promise.all(
    siblingRows.map(async (sibling) => ({
      trackPath: `/track/customer/${await createTrackerToken({ kind: "customer", referralId: sibling.id })}`,
      state: sibling.state,
      zip: sibling.zip,
      status: sibling.status,
      createdAt: sibling.createdAt,
    })),
  );

  return { ...row, otherOrders };
}
