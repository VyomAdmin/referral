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

// Oldest vehicle year the quote form accepts. Anything older is almost always
// a typo (a phone number fragment, a partial year) rather than a real car we'd
// be asked to fit glass to.
export const MIN_VEHICLE_YEAR = 1950;

// Next model year, not the current one: dealers sell the following year's
// models from roughly Q3, so a 2027 in late 2026 is legitimate.
export function maxVehicleYear(now: Date = new Date()) {
  return now.getFullYear() + 1;
}

export function isValidVehicleYear(year: string, now: Date = new Date()) {
  if (!/^\d{4}$/.test(year)) return false;
  const value = Number(year);
  return value >= MIN_VEHICLE_YEAR && value <= maxVehicleYear(now);
}

// Makes whose canonical spelling isn't plain title case. Keyed by the
// lowercased input so any casing the customer types collapses to one form.
// This is the "RAM vs Ram" drift the cutover audit flagged: free-text vehicle
// fields were reaching HubSpot in whatever casing was typed, fragmenting
// reports that group by make. Normalizing on the way in keeps one spelling per
// make without forcing a dropdown.
const VEHICLE_TEXT_EXCEPTIONS: Record<string, string> = {
  ram: "RAM",
  bmw: "BMW",
  gmc: "GMC",
  mini: "MINI",
  kia: "Kia",
  fiat: "FIAT",
  mazda: "Mazda",
  bev: "BEV",
  suv: "SUV",
  ev: "EV",
  crv: "CR-V",
  "cr-v": "CR-V",
  hrv: "HR-V",
  "hr-v": "HR-V",
  rav4: "RAV4",
  "cx-5": "CX-5",
  cx5: "CX-5",
  "cx-9": "CX-9",
  gti: "GTI",
  wrx: "WRX",
  sti: "STI",
  tlx: "TLX",
  mdx: "MDX",
  rdx: "RDX",
  ilx: "ILX",
  qx60: "QX60",
  q50: "Q50",
  xc90: "XC90",
  xc60: "XC60",
  f150: "F-150",
  "f-150": "F-150",
  f250: "F-250",
  "f-250": "F-250",
  f350: "F-350",
  "f-350": "F-350",
  x3: "X3",
  x5: "X5",
  a4: "A4",
  q5: "Q5",
  cla: "CLA",
  glc: "GLC",
  gle: "GLE",
  id4: "ID.4",
  "id.4": "ID.4",
};

// Title-cases a free-text vehicle make or model, word by word, honouring the
// exception map above. Multi-word values ("grand cherokee") normalize per word
// so "GRAND CHEROKEE" and "grand cherokee" both become "Grand Cherokee".
export function normalizeVehicleText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const exact = VEHICLE_TEXT_EXCEPTIONS[word.toLowerCase()];
      if (exact) return exact;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
