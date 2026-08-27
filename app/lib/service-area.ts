import serviceableZipsData from "../../serviceableZips.json" with { type: "json" };
import insuranceProvidersData from "../../insuranceProviders.json" with { type: "json" };

// 3-digit ZIP prefixes NuVision actually services today — narrower than the
// AZ/FL numeric ranges alone (e.g. AZ's 851/854/858/861/862 and FL's
// 340/343/345/348 are in-range but not in this list). Shared by both the
// client-side live ZIP check and the server-side submission validator so
// they can never drift apart.
export const SERVICEABLE_ZIP_PREFIXES: ReadonlySet<string> = new Set(serviceableZipsData.data);

export function isServiceableZipPrefix(zip: string): boolean {
  return /^\d{3}/.test(zip) && SERVICEABLE_ZIP_PREFIXES.has(zip.slice(0, 3));
}

// HubSpot's insurance_provider_2 picklist options, used to populate the
// referral form's dropdown so a submission can only ever contain a value
// that picklist already recognizes.
export const INSURANCE_PROVIDERS: readonly string[] = insuranceProvidersData.data;
