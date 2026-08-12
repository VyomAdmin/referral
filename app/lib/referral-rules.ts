export type StateCampaign = {
  state: "AZ" | "FL" | "SC" | "CO";
  stateName: string;
  campaignName: string;
  serviceMessage: string;
  customerOffer: string | null;
  referrerReward: number;
  accent: "blue" | "sun" | "ocean" | "mountain";
};

const campaigns: Record<StateCampaign["state"], StateCampaign> = {
  AZ: {
    state: "AZ",
    stateName: "Arizona",
    campaignName: "Arizona Friends & Family",
    serviceMessage: "Same-day mobile windshield replacement across Arizona.",
    customerOffer: "$50 additional cash back with insurance or $50 off a cash payment.",
    referrerReward: 50,
    accent: "sun",
  },
  FL: {
    state: "FL",
    stateName: "Florida",
    campaignName: "Florida Friends & Family",
    serviceMessage: "Trusted mobile windshield service throughout Florida.",
    customerOffer: null,
    referrerReward: 50,
    accent: "ocean",
  },
  SC: {
    state: "SC",
    stateName: "South Carolina",
    campaignName: "South Carolina Referrals",
    serviceMessage: "Convenient mobile auto glass service in South Carolina.",
    customerOffer: null,
    referrerReward: 50,
    accent: "blue",
  },
  CO: {
    state: "CO",
    stateName: "Colorado",
    campaignName: "Colorado Referrals",
    serviceMessage: "Professional windshield replacement across Colorado.",
    customerOffer: null,
    referrerReward: 50,
    accent: "mountain",
  },
};

export function campaignForZip(zip: string): StateCampaign | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  if (prefix >= 850 && prefix <= 865) return campaigns.AZ;
  if (prefix >= 320 && prefix <= 349) return campaigns.FL;
  if (prefix >= 290 && prefix <= 299) return campaigns.SC;
  if (prefix >= 800 && prefix <= 816) return campaigns.CO;
  return null;
}

export function createReferralCode(firstName: string, lastName: string, seed: number) {
  const clean = `${firstName[0] ?? "N"}${lastName[0] ?? "V"}`
    .toUpperCase()
    .replace(/[^A-Z]/g, "") || "NV";
  return `NV-${clean}-${String(seed).slice(-4).padStart(4, "0")}`;
}

export const supportedCampaigns = Object.values(campaigns);
