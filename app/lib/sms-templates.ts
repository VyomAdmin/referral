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
