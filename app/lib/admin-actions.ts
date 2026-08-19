"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { referrals } from "../../db/schema.ts";
import { auth } from "./auth";
import { logAuditEvent } from "./audit";

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
