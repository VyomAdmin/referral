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

// Fallback casing map for vehicle text the catalogue doesn't recognise (an
// "Other" make, or a model typed free-hand). cars.json is the real source of
// truth — see canonicalizeVehicle in vehicle-catalog.ts, which consults it
// first. Entries here must not contradict the catalogue's own spellings;
// tests/vehicle-catalog.test.ts enforces that.
const VEHICLE_TEXT_EXCEPTIONS: Record<string, string> = {
  ram: "RAM",
  bmw: "BMW",
  mclaren: "McLaren",
  gmc: "GMC",
  mini: "Mini",
  kia: "Kia",
  fiat: "Fiat",
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
      // Hyphenated names capitalise each part ("mercedes-benz" -> "Mercedes-Benz").
      return word
        .split("-")
        .map((part) => {
          const partException = VEHICLE_TEXT_EXCEPTIONS[part.toLowerCase()];
          if (partException) return partException;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-");
    })
    .join(" ");
}
