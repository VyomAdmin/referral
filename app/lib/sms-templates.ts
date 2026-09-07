import type { StateCampaign } from "./referral-rules";
import type { EmailEvent } from "./email-templates";

// SMS counterpart to email-templates.ts's six events — used the same way,
// as the fallback content when a campaign has no active custom SMS template.
export type SmsLinks = { referralLink: string; trackerLink: string };

export function smsTemplate(event: EmailEvent, recipientName: string, campaign: StateCampaign, links?: SmsLinks): string {
  const firstName = recipientName.trim().split(/\s+/)[0] || "there";
  // A welcome text with no link in it is useless — sharing by text is the whole
  // point, and the referrer can't share what isn't there. Tracker link on the
  // status messages, for the same reason the emails point there.
  const share = links ? ` Share it: ${links.referralLink}` : "";
  const track = links ? ` Track it: ${links.trackerLink}` : "";
  const templates: Record<EmailEvent, string> = {
    referrer_welcome: `Hi ${firstName}, your NuVision referral link is ready.${share} You earn $${campaign.referrerReward} once a referred install is completed — they must book through your link. Reply STOP to opt out.`,
    referral_received: `Hi ${firstName}, someone used your link to request ${campaign.stateName} auto glass service.${track} Reply STOP to opt out.`,
    appointment_scheduled: `Hi ${firstName}, your referred customer's ${campaign.stateName} appointment is booked.${track} Reply STOP to opt out.`,
    installation_completed: `Hi ${firstName}, your referred customer's installation is complete — your $${campaign.referrerReward} reward is being processed.${track} Reply STOP to opt out.`,
    reward_earned: `Hi ${firstName}, your $${campaign.referrerReward} referral reward is approved and queued for payment, ${campaign.rewardMethods}.${track} Reply STOP to opt out.`,
    reward_paid: `Hi ${firstName}, your $${campaign.referrerReward} NuVision referral reward has been paid. Thanks for the recommendation — your link stays active.${share} Reply STOP to opt out.`,
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
