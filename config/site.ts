// Single source for the company identity, the one campaign, and integration
// settings. Values come from the environment. Empty means the business has
// not supplied them. Do not put a company name, domain, ZIP, or reward here.

export const MARKET_STATES = ["FL", "SC"] as const;
export type MarketState = (typeof MARKET_STATES)[number];

export const NOT_SET = "not set";

export const SMS_CONSENT_PLACEHOLDER =
  "PLACEHOLDER — counsel must approve. I agree to receive text messages about this referral program from the company named in the site configuration. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of any purchase.";

export const PRIVACY_PLACEHOLDER =
  "PLACEHOLDER — counsel must approve. This page will describe what the company collects, how text messaging works, that recipients can reply STOP to opt out and HELP for help, and how to contact the company. It is not approved wording.";

export const TERMS_PLACEHOLDER =
  "PLACEHOLDER — counsel must approve. This page will describe who may refer, when a reward becomes eligible, and that a reward is not paid until installation is complete. It is not approved wording.";

export type SiteConfig = {
  legalName: string;
  brandName: string;
  domain: string;
  emailFrom: string;
  emailFromName: string;
  payoutLine: string;
  smsConsentText: string;
  privacyText: string;
  termsText: string;
  offerText: string;
  rewardAmount: number | null;
  customerBenefit: string | null;
  signupLimit: number;
  signupWindowMinutes: number;
  quoteLimit: number;
  quoteWindowMinutes: number;
  inviteTtlHours: number;
  ghlApiBase: string;
  ghlApiVersion: string;
  ghlLocationId: string;
  ghlPipelineId: string;
  ghlPrivateToken: string;
  ghlClientId: string;
  ghlClientSecret: string;
  ghlRefreshToken: string;
  ghlWebhookPublicKey: string;
  ghlStageIds: Partial<Record<string, string>>;
  ghlCustomFieldIds: Partial<Record<string, string>>;
};

function text(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? "").trim();
}

function count(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = text(env, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalAmount(env: NodeJS.ProcessEnv, key: string): number | null {
  const raw = text(env, key);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function optionalText(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = text(env, key);
  return raw ? raw : null;
}

function jsonObject(env: NodeJS.ProcessEnv, key: string): Record<string, string> {
  const raw = text(env, key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[name] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function readSiteConfig(env: NodeJS.ProcessEnv = process.env): SiteConfig {
  return {
    legalName: text(env, "COMPANY_LEGAL_NAME"),
    brandName: text(env, "COMPANY_BRAND_NAME"),
    domain: text(env, "COMPANY_DOMAIN"),
    emailFrom: text(env, "EMAIL_FROM"),
    emailFromName: text(env, "EMAIL_FROM_NAME"),
    payoutLine: text(env, "PAYOUT_LINE"),
    smsConsentText: text(env, "SMS_CONSENT_TEXT") || SMS_CONSENT_PLACEHOLDER,
    privacyText: text(env, "PRIVACY_TEXT") || PRIVACY_PLACEHOLDER,
    termsText: text(env, "TERMS_TEXT") || TERMS_PLACEHOLDER,
    offerText: text(env, "OFFER_TEXT"),
    rewardAmount: optionalAmount(env, "REFERRER_REWARD_AMOUNT"),
    customerBenefit: optionalText(env, "CUSTOMER_BENEFIT"),
    // Carried from the previous server actions: 5 submissions per 10 minutes.
    signupLimit: count(env, "SIGNUP_RATE_LIMIT", 5),
    signupWindowMinutes: count(env, "SIGNUP_RATE_WINDOW_MINUTES", 10),
    quoteLimit: count(env, "QUOTE_RATE_LIMIT", 5),
    quoteWindowMinutes: count(env, "QUOTE_RATE_WINDOW_MINUTES", 10),
    // Carried from the previous invite token helper: 7 days.
    inviteTtlHours: count(env, "INVITE_TTL_HOURS", 24 * 7),
    ghlApiBase: text(env, "GHL_API_BASE") || "https://services.leadconnectorhq.com",
    ghlApiVersion: text(env, "GHL_API_VERSION"),
    ghlLocationId: text(env, "GHL_LOCATION_ID"),
    ghlPipelineId: text(env, "GHL_PIPELINE_ID"),
    ghlPrivateToken: text(env, "GHL_PRIVATE_INTEGRATION_TOKEN"),
    ghlClientId: text(env, "GHL_CLIENT_ID"),
    ghlClientSecret: text(env, "GHL_CLIENT_SECRET"),
    ghlRefreshToken: text(env, "GHL_REFRESH_TOKEN"),
    ghlWebhookPublicKey: text(env, "GHL_WEBHOOK_PUBLIC_KEY"),
    ghlStageIds: jsonObject(env, "GHL_STAGE_IDS"),
    ghlCustomFieldIds: jsonObject(env, "GHL_CUSTOM_FIELD_IDS"),
  };
}

export function displayOrNotSet(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NOT_SET;
  return String(value);
}

export function brandLabel(config: SiteConfig): string {
  return config.brandName || NOT_SET;
}

export function ghlAuthMode(config: SiteConfig): "private-token" | "oauth" | "unconfigured" {
  if (config.ghlPrivateToken) return "private-token";
  if (config.ghlClientId && config.ghlClientSecret && config.ghlRefreshToken) return "oauth";
  return "unconfigured";
}

export function publicSiteConfig(config: SiteConfig) {
  return {
    legalName: displayOrNotSet(config.legalName),
    brandName: displayOrNotSet(config.brandName),
    domain: displayOrNotSet(config.domain),
    payoutLine: displayOrNotSet(config.payoutLine),
    offerText: displayOrNotSet(config.offerText),
    rewardAmount: displayOrNotSet(config.rewardAmount),
    customerBenefit: displayOrNotSet(config.customerBenefit),
    smsConsentText: config.smsConsentText,
    privacyText: config.privacyText,
    termsText: config.termsText,
    states: MARKET_STATES,
  };
}
