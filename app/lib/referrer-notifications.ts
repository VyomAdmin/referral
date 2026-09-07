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
  // Physical address for the CAN-SPAM footer, when the org has one on file.
  postalAddress?: string | null;
};

// Both AZ and FL currently pay the same $50 referrer reward, so this is a
// safe stand-in for legacy-content rendering (referrer_welcome, and any other
// event that fires with no resolved campaign) — only .referrerReward is read
// for that event; stateName/customerOffer aren't referenced.
const FALLBACK_CAMPAIGN = supportedCampaigns[0];

async function resolveDomain(organizationId: string): Promise<string> {
  const [org] = await getDb().select({ referralDomain: organizations.referralDomain }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return org?.referralDomain ?? "referrals.nuvisionautoglass.com";
}

// Which link each referrer email should open. Only the welcome email is about
// sharing; the rest are status updates and belong on the tracker.
//
// Every one of these used to open the referral link, because the HTML builder
// took a single `referralLink`. So "Track my referrals" and "View reward
// details" both landed the referrer on /r/<code> — the page their *friend* is
// meant to fill in. A referrer following their own email could submit
// themselves as their own referred customer.
const EVENT_DESTINATION: Record<EmailEvent, "referral" | "tracker"> = {
  referrer_welcome: "referral",
  referral_received: "tracker",
  appointment_scheduled: "tracker",
  installation_completed: "tracker",
  reward_earned: "tracker",
  reward_paid: "tracker",
};

function buildContext(referrer: NotifiableReferrer, campaign: StateCampaign, referralLink: string, trackerLink: string): PersonalizationContext {
  return {
    first_name: referrer.firstName,
    referrer_name: `${referrer.firstName} ${referrer.lastName}`.trim(),
    referral_link: referralLink,
    tracker_link: trackerLink,
    campaign_name: campaign.campaignName,
    state_name: campaign.stateName,
    reward_amount: String(campaign.referrerReward),
  };
}

// "sans-serif" alone is not a font stack: several clients resolve a bare
// generic family unpredictably, which is why one template's heading rendered
// in monospace. Name real faces and keep the generic as the last resort.
const EMAIL_FONT = "Arial, Helvetica, sans-serif";

// CAN-SPAM identification: a transactional message still has to say who sent
// it and where they are. Physical address comes from the org row when set.
function emailFooterHtml(postalAddress: string | null): string {
  return `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:#64748b">
    <img src="https://referrals.nuvisionautoglass.com/nuvision-wordmark-color.png" alt="NuVision Auto Glass" width="120" style="display:block;margin-bottom:10px" />
    <p style="margin:0 0 6px">NuVision Auto Glass${postalAddress ? ` &middot; ${postalAddress}` : ""}</p>
    <p style="margin:0 0 6px">You are receiving this because you joined the NuVision referral program.</p>
    <p style="margin:0"><a href="https://referrals.nuvisionautoglass.com/terms" style="color:#64748b">Referral Program Terms</a> &middot; <a href="${NUVISION_PRIVACY_URL}" style="color:#64748b">Privacy Policy</a></p>
  </div>`;
}

const NUVISION_PRIVACY_URL = "https://www.nuvisionautoglass.com/privacy-policy/";

function legacyEmailHtml(template: EmailTemplate, ctaUrl: string, referralLink: string, postalAddress: string | null): string {
  return `<div style="font-family:${EMAIL_FONT};max-width:480px;margin:0 auto">
    <h1 style="font-family:${EMAIL_FONT};font-size:22px;color:#00568c">${template.heading}</h1>
    <p style="font-family:${EMAIL_FONT};font-size:15px;line-height:1.5;color:#1e293b">${template.body}</p>
    <a href="${ctaUrl}" style="display:inline-block;margin-top:16px;padding:12px 22px;background:#00568c;color:#fff;text-decoration:none;border-radius:8px;font-family:${EMAIL_FONT};font-weight:700">${template.buttonLabel}</a>
    <p style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.6;color:#475569;margin-top:18px">
      Your referral link, to copy and share:<br />
      <span style="color:#00568c;word-break:break-all">${referralLink}</span>
    </p>
    ${emailFooterHtml(postalAddress)}
  </div>`;
}

// A text/plain alternative, so the link survives clients that strip HTML and so
// the message isn't a single HTML part (which hurts deliverability).
function legacyEmailText(template: EmailTemplate, ctaUrl: string, referralLink: string, postalAddress: string | null): string {
  return [
    template.heading,
    "",
    template.body,
    "",
    `${template.buttonLabel}: ${ctaUrl}`,
    "",
    `Your referral link, to copy and share: ${referralLink}`,
    "",
    "---",
    `NuVision Auto Glass${postalAddress ? ` - ${postalAddress}` : ""}`,
    "You are receiving this because you joined the NuVision referral program.",
    "Referral Program Terms: https://referrals.nuvisionautoglass.com/terms",
    `Privacy Policy: ${NUVISION_PRIVACY_URL}`,
  ].join("\n");
}

async function sendReferrerEmail(event: EmailEvent, referrer: NotifiableReferrer, options: NotifyReferrerOptions, context: PersonalizationContext, campaign: StateCampaign) {
  let subject: string;
  let html: string;
  let text: string | undefined;
  let templateId: string | null = null;

  const active = options.campaignId ? await getActiveCampaignEmailTemplate(options.campaignId, event) : null;
  if (active) {
    subject = renderTemplate(active.subject, context);
    html = renderTemplate(active.bodyHtml, context);
    text = active.bodyText ? renderTemplate(active.bodyText, context) : undefined;
    templateId = active.id;
  } else {
    const legacy = emailTemplate(event, referrer.firstName, campaign);
    const ctaUrl = EVENT_DESTINATION[event] === "tracker" ? context.tracker_link : context.referral_link;
    subject = legacy.subject;
    html = legacyEmailHtml(legacy, ctaUrl, context.referral_link, options.postalAddress ?? null);
    text = legacyEmailText(legacy, ctaUrl, context.referral_link, options.postalAddress ?? null);
  }

  const result = await sendEmail({ to: referrer.email, subject, html, text, tag: event });
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

  const active = options.campaignId ? await getActiveCampaignSmsTemplate(options.campaignId, event) : null;
  if (active) {
    body = renderTemplate(active.body, context);
    templateId = active.id;
  } else {
    body = smsTemplate(event, referrer.firstName, campaign, { referralLink: context.referral_link, trackerLink: context.tracker_link });
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
    const domain = await resolveDomain(referrer.organizationId);
    const referralLink = `https://${domain}/r/${referrer.code}`;
    // The lookup page, not a minted token: a long-lived signed tracker URL sitting
    // in an inbox is a standing credential, and /track re-verifies identity.
    const trackerLink = `https://${domain}/track`;
    const context = buildContext(referrer, campaign, referralLink, trackerLink);

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
