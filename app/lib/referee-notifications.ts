import { getDb } from "../../db/index.ts";
import { smsEvents } from "../../db/schema.ts";
import { refereeConfirmationSms } from "./sms-templates.ts";
import { sendSms, twilioFromNumberForState } from "./sms-sender.ts";
import type { StateCampaign } from "./referral-rules.ts";

export type NotifiableReferee = { id: string; organizationId: string; firstName: string; phone: string };

// Best-effort, like notifyReferrer: an SMS failure (or Twilio not being
// configured yet) must never block the customer's referral submission.
export async function notifyReferee(referral: NotifiableReferee, referrerName: string, campaign: StateCampaign) {
  try {
    const body = refereeConfirmationSms(referral.firstName, referrerName, campaign);
    const result = await sendSms({ to: referral.phone, body, from: twilioFromNumberForState(campaign.state) });
    await getDb().insert(smsEvents).values({
      id: crypto.randomUUID(),
      organizationId: referral.organizationId,
      referralId: referral.id,
      referrerId: null,
      templateId: null,
      templateKey: "referee_referral_confirmation",
      recipient: referral.phone,
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.ok ? result.providerMessageId : null,
      errorMessage: result.ok ? null : result.error,
    });
  } catch (error) {
    console.error(`[referee-notifications] failed to notify referee for referral ${referral.id}:`, error);
  }
}
