import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { emailEvents, organizations, smsEvents } from "../../db/schema.ts";
import { refereeConfirmationSms } from "./sms-templates.ts";
import { sendEmail } from "./email-sender.ts";
import { sendSms, twilioFromNumberForState } from "./sms-sender.ts";
import type { StateCampaign } from "./referral-rules.ts";

export type NotifiableReferee = { id: string; organizationId: string; firstName: string; email: string; phone: string };

async function resolveTrackerUrl(organizationId: string, trackPath: string): Promise<string> {
  const [org] = await getDb().select({ referralDomain: organizations.referralDomain }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const domain = org?.referralDomain ?? "referrals.nuvisionautoglass.com";
  return `https://${domain}${trackPath}`;
}

function refereeConfirmationEmailHtml(firstName: string, referrerName: string, campaign: StateCampaign, trackUrl: string): string {
  const offer = campaign.customerOffer ? `<p style="font-size:15px;line-height:1.5;color:#1e293b">Your referral benefit: ${campaign.customerOffer}</p>` : "";
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h1 style="font-size:22px;color:#00568c">Thanks for your request, ${firstName}!</h1>
    <p style="font-size:15px;line-height:1.5;color:#1e293b">NuVision has received your ${campaign.stateName} windshield service request through ${referrerName}'s referral. A specialist will reach out shortly to schedule your appointment.</p>
    ${offer}
    <a href="${trackUrl}" style="display:inline-block;margin-top:16px;padding:12px 22px;background:#00568c;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Track your service</a>
  </div>`;
}

// Best-effort, like notifyReferrer: an SMS/email failure (or a provider not
// being configured yet) must never block the customer's referral submission.
export async function notifyReferee(referral: NotifiableReferee, trackPath: string, referrerName: string, campaign: StateCampaign) {
  try {
    const trackUrl = await resolveTrackerUrl(referral.organizationId, trackPath);

    const smsBody = refereeConfirmationSms(referral.firstName, referrerName, campaign, trackUrl);
    const smsResult = await sendSms({ to: referral.phone, body: smsBody, from: twilioFromNumberForState(campaign.state) });
    await getDb().insert(smsEvents).values({
      id: crypto.randomUUID(),
      organizationId: referral.organizationId,
      referralId: referral.id,
      referrerId: null,
      templateId: null,
      templateKey: "referee_referral_confirmation",
      recipient: referral.phone,
      status: smsResult.ok ? "sent" : "failed",
      providerMessageId: smsResult.ok ? smsResult.providerMessageId : null,
      errorMessage: smsResult.ok ? null : smsResult.error,
    });

    const emailResult = await sendEmail({
      to: referral.email,
      subject: `Your NuVision ${campaign.stateName} service request is confirmed`,
      html: refereeConfirmationEmailHtml(referral.firstName, referrerName, campaign, trackUrl),
      text: `Thanks for your request, ${referral.firstName}! NuVision has received your ${campaign.stateName} windshield service request through ${referrerName}'s referral. Track it here: ${trackUrl}`,
      tag: "referee_referral_confirmation",
    });
    await getDb().insert(emailEvents).values({
      id: crypto.randomUUID(),
      organizationId: referral.organizationId,
      referralId: referral.id,
      referrerId: null,
      templateId: null,
      templateKey: "referee_referral_confirmation",
      recipient: referral.email,
      status: emailResult.ok ? "sent" : "failed",
      providerMessageId: emailResult.ok ? emailResult.providerMessageId : null,
      errorMessage: emailResult.ok ? null : emailResult.error,
    });
  } catch (error) {
    console.error(`[referee-notifications] failed to notify referee for referral ${referral.id}:`, error);
  }
}
