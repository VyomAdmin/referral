import type { AdminReferral } from "./admin-data";

export function rewardEligible(referral: AdminReferral) {
  return referral.status === "installed" && Boolean(referral.installedAt);
}

export function canMarkRewardPaid(referral: AdminReferral) {
  return rewardEligible(referral) && referral.status !== "paid";
}

export function searchReferrals(referrals: AdminReferral[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return referrals;
  return referrals.filter((referral) =>
    [
      referral.id,
      referral.code,
      referral.referrer,
      referral.referrerEmail,
      referral.customer,
      referral.customerEmail,
      referral.phone,
      referral.zip,
      referral.state,
      referral.hubspotDealId,
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}

export function statusLabel(status: AdminReferral["status"]) {
  return ({ received: "Referral received", scheduled: "Appointment scheduled", installed: "Installation completed", paid: "Reward paid", cancelled: "Cancelled" } as const)[status];
}
