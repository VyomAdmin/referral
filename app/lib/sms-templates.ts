import type { StateCampaign } from "./referral-rules";
import type { EmailEvent } from "./email-templates";

// SMS counterpart to email-templates.ts's six events — used the same way,
// as the fallback content when a campaign has no active custom SMS template.
export function smsTemplate(event: EmailEvent, recipientName: string, campaign: StateCampaign): string {
  const firstName = recipientName.trim().split(/\s+/)[0] || "there";
  const templates: Record<EmailEvent, string> = {
    referrer_welcome: `Hi ${firstName}, your NuVision referral link is ready! Share it and earn $${campaign.referrerReward} per completed install. Reply STOP to opt out.`,
    referral_received: `Hi ${firstName}, we received a new ${campaign.stateName} referral through your link. We'll keep you posted. Reply STOP to opt out.`,
    appointment_scheduled: `Hi ${firstName}, your referred customer's ${campaign.stateName} appointment is scheduled. Reply STOP to opt out.`,
    installation_completed: `Hi ${firstName}, your referred customer's installation is complete. Thanks for spreading the word! Reply STOP to opt out.`,
    reward_earned: `Hi ${firstName}, your $${campaign.referrerReward} referral reward is now eligible to process. Reply STOP to opt out.`,
    reward_paid: `Hi ${firstName}, your $${campaign.referrerReward} NuVision referral reward has been paid. Thank you! Reply STOP to opt out.`,
  };
  return templates[event];
}

// Sent once, right after a referred customer (the referee) submits the form —
// confirms receipt and sets expectations, doesn't try to mirror every
// referrer lifecycle event. referrerName lets the referee recognize why
// they're getting a text from a number they don't know. trackUrl is the
// referee's only durable way back to their status page (there's no login),
// so it belongs before the opt-out line, not tacked on after it.
export function refereeConfirmationSms(customerFirstName: string, referrerName: string, campaign: StateCampaign, trackUrl: string): string {
  const firstName = customerFirstName.trim().split(/\s+/)[0] || "there";
  const offer = campaign.customerOffer ? ` ${campaign.customerOffer}` : "";
  return `Hi ${firstName}, thanks for your interest in NuVision Auto Glass through ${referrerName}'s referral!${offer} We'll reach out shortly to schedule your service. Track it here: ${trackUrl} Reply STOP to opt out.`;
}
