import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { emailEvents, organizations, referrers, smsEvents } from "../../db/schema.ts";
import { emailTemplate } from "./email-templates.ts";
import type { EmailEvent, EmailTemplate } from "./email-templates.ts";
import { smsTemplate } from "./sms-templates.ts";
import { sendEmail } from "./email-sender.ts";
import { sendSms, twilioFromNumberForState } from "./sms-sender.ts";
import { renderTemplate } from "./personalization.ts";
import type { PersonalizationContext } from "./personalization.ts";
import { getActiveCampaignEmailTemplate, getActiveCampaignSmsTemplate } from "./campaign-templates.ts";
import { campaignForState, supportedCampaigns } from "./referral-rules.ts";
import type { StateCampaign } from "./referral-rules.ts";

export type NotifiableReferrer = { id: string; organizationId: string; firstName: string; lastName: string; email: string; phone: string; code: string };

export type NotifyReferrerOptions = {
  // Known once a referral exists for this referrer; absent at signup, since
  // state isn't collected until their first referred customer submits a ZIP.
  // Without it, referrer_welcome always falls back to the legacy content —
  // there's no campaign yet to look an active template up against.
  campaignId?: string;
  campaign?: StateCampaign;
  referralId?: string;
};

// Both AZ and FL currently pay the same $50 referrer reward, so this is a
// safe stand-in for legacy-content rendering (referrer_welcome, and any other
// event that fires with no resolved campaign) — only .referrerReward is read
// for that event; stateName/customerOffer aren't referenced.
const FALLBACK_CAMPAIGN = supportedCampaigns[0];

async function resolveReferralLink(organizationId: string, code: string): Promise<string> {
  const [org] = await getDb().select({ referralDomain: organizations.referralDomain }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const domain = org?.referralDomain ?? "referrals.nuvisionautoglass.com";
  return `https://${domain}/r/${code}`;
}

function buildContext(referrer: NotifiableReferrer, campaign: StateCampaign, referralLink: string): PersonalizationContext {
  return {
    first_name: referrer.firstName,
    referrer_name: `${referrer.firstName} ${referrer.lastName}`.trim(),
    referral_link: referralLink,
    campaign_name: campaign.campaignName,
    state_name: campaign.stateName,
    reward_amount: String(campaign.referrerReward),
  };
}

function legacyEmailHtml(template: EmailTemplate, referralLink: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h1 style="font-size:22px;color:#00568c">${template.heading}</h1>
    <p style="font-size:15px;line-height:1.5;color:#1e293b">${template.body}</p>
    <a href="${referralLink}" style="display:inline-block;margin-top:16px;padding:12px 22px;background:#00568c;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${template.buttonLabel}</a>
  </div>`;
}

async function sendReferrerEmail(event: EmailEvent, referrer: NotifiableReferrer, options: NotifyReferrerOptions, context: PersonalizationContext, campaign: StateCampaign) {
  let subject: string;
  let html: string;
  let text: string | undefined;
  let templateId: string | null = null;

  const active = options.campaignId ? await getActiveCampaignEmailTemplate(options.campaignId) : null;
  if (active) {
    subject = renderTemplate(active.subject, context);
    html = renderTemplate(active.bodyHtml, context);
    text = active.bodyText ? renderTemplate(active.bodyText, context) : undefined;
    templateId = active.id;
  } else {
    const legacy = emailTemplate(event, referrer.firstName, campaign);
    subject = legacy.subject;
    html = legacyEmailHtml(legacy, context.referral_link);
  }

  const result = await sendEmail({ to: referrer.email, subject, html, text });
  await getDb().insert(emailEvents).values({
    id: crypto.randomUUID(),
    organizationId: referrer.organizationId,
    referralId: options.referralId ?? null,
    referrerId: referrer.id,
    templateId,
    templateKey: event,
    recipient: referrer.email,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.ok ? result.providerMessageId : null,
    errorMessage: result.ok ? null : result.error,
  });
}

async function sendReferrerSms(event: EmailEvent, referrer: NotifiableReferrer, options: NotifyReferrerOptions, context: PersonalizationContext, campaign: StateCampaign) {
  let body: string;
  let templateId: string | null = null;

  const active = options.campaignId ? await getActiveCampaignSmsTemplate(options.campaignId) : null;
  if (active) {
    body = renderTemplate(active.body, context);
    templateId = active.id;
  } else {
    body = smsTemplate(event, referrer.firstName, campaign);
  }

  const result = await sendSms({ to: referrer.phone, body, from: twilioFromNumberForState(campaign.state) });
  await getDb().insert(smsEvents).values({
    id: crypto.randomUUID(),
    organizationId: referrer.organizationId,
    referralId: options.referralId ?? null,
    referrerId: referrer.id,
    templateId,
    templateKey: event,
    recipient: referrer.phone,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.ok ? result.providerMessageId : null,
    errorMessage: result.ok ? null : result.error,
  });
}

// Best-effort, like syncReferralToHubSpot: a referrer message failing (or
// providers not being configured yet) must never break the caller's flow
// (referrer signup, a referral status change, a reward payout).
export async function notifyReferrer(event: EmailEvent, referrer: NotifiableReferrer, options: NotifyReferrerOptions = {}) {
  try {
    const campaign = options.campaign ?? FALLBACK_CAMPAIGN;
    const referralLink = await resolveReferralLink(referrer.organizationId, referrer.code);
    const context = buildContext(referrer, campaign, referralLink);

    await Promise.all([
      sendReferrerEmail(event, referrer, options, context, campaign),
      sendReferrerSms(event, referrer, options, context, campaign),
    ]);
  } catch (error) {
    console.error(`[referrer-notifications] failed to notify referrer ${referrer.id} of "${event}":`, error);
  }
}

const STATUS_TO_EVENT: Partial<Record<string, EmailEvent>> = {
  scheduled: "appointment_scheduled",
  installed: "installation_completed",
  paid: "reward_paid",
};

export type NotifiableReferralStatus = { id: string; organizationId: string; referrerId: string; campaignId: string; state: string };

// Shared by every place a referral's publicStatus changes (the HubSpot
// webhook, the reconciliation poll, and the admin reward-paid action) so the
// status -> event mapping lives in exactly one place. No-ops for statuses
// with no referrer-facing message ("received" is handled at submission time
// in referral-actions.ts, since it's not a status *change*).
export async function notifyReferrerOfReferralStatus(referral: NotifiableReferralStatus, newStatus: string) {
  const event = STATUS_TO_EVENT[newStatus];
  if (!event) return;

  const [referrer] = await getDb().select().from(referrers).where(eq(referrers.id, referral.referrerId)).limit(1);
  if (!referrer) return;

  const campaign = campaignForState(referral.state as StateCampaign["state"]);
  await notifyReferrer(event, referrer, { campaignId: referral.campaignId, campaign, referralId: referral.id });
}
