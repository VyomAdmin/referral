export type ReferralStatus = "received" | "scheduled" | "installed" | "paid" | "cancelled";

export type AdminReferral = {
  id: string;
  code: string;
  referrer: string;
  referrerEmail: string;
  customer: string;
  customerEmail: string;
  phone: string;
  state: "AZ" | "FL";
  zip: string;
  status: ReferralStatus;
  hubspotDealId: string;
  hubspotStage: string;
  submittedAt: string;
  installedAt: string | null;
  rewardAmount: number;
  syncStatus: "synced" | "pending" | "failed" | "skipped";
};
