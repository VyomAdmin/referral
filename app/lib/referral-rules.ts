import { isServiceableZipPrefix } from "./service-area.ts";

export type StateCampaign = {
  state: "AZ" | "FL";
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
};

export function campaignForZip(zip: string): StateCampaign | null {
  if (!/^\d{5}$/.test(zip)) return null;
  if (!isServiceableZipPrefix(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  if (prefix >= 850 && prefix <= 865) return campaigns.AZ;
  if (prefix >= 320 && prefix <= 349) return campaigns.FL;
  return null;
}

export function stateName(state: StateCampaign["state"]): string {
  return campaigns[state].stateName;
}

export function campaignForState(state: StateCampaign["state"]): StateCampaign {
  return campaigns[state];
}

export function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

export function createReferralCode(firstName: string, lastName: string, seed: number) {
  const clean = `${firstName[0] ?? "N"}${lastName[0] ?? "V"}`
    .toUpperCase()
    .replace(/[^A-Z]/g, "") || "NV";
  return `NV-${clean}-${String(seed).slice(-4).padStart(4, "0")}`;
}

export const supportedCampaigns = Object.values(campaigns);
