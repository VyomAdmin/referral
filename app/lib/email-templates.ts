import type { StateCampaign } from "./referral-rules";

export type EmailEvent =
  | "referrer_welcome"
  | "referral_received"
  | "appointment_scheduled"
  | "installation_completed"
  | "reward_earned"
  | "reward_paid";

export type EmailTemplate = {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  buttonLabel: string;
};

export function emailTemplate(
  event: EmailEvent,
  recipientName: string,
  campaign: StateCampaign,
): EmailTemplate {
  const firstName = recipientName.trim().split(/\s+/)[0] || "there";
  const templates: Record<EmailEvent, EmailTemplate> = {
    referrer_welcome: {
      subject: `${firstName}, your NuVision referral link is ready`,
      preheader: `Earn $${campaign.referrerReward} for every completed installation you refer.`,
      heading: `Welcome, ${firstName}.`,
      body: `Share your link with friends, family, or anyone who needs auto glass work in ${campaign.stateName}. You earn $${campaign.referrerReward} once a referred customer's installation is completed — not before, and only if they book through your link. You'll be paid ${campaign.rewardMethods}.`,
      buttonLabel: "View & share my link",
    },
    referral_received: {
      subject: "Your NuVision referral was received",
      preheader: "We have your referral and will keep you updated.",
      heading: "A referral just came in.",
      body: `Someone used your link to request ${campaign.stateName} auto glass service. We'll contact them shortly, and you'll hear from us at each stage. Your $${campaign.referrerReward} reward is confirmed once their installation is completed.`,
      buttonLabel: "Track my referrals",
    },
    appointment_scheduled: {
      subject: "Your NuVision appointment is scheduled",
      preheader: "Review the latest status of your windshield service.",
      heading: "Your appointment is on the calendar.",
      body: `Your ${campaign.stateName} service request has moved to Appointment scheduled.`,
      buttonLabel: "Track my service",
    },
    installation_completed: {
      subject: "Your NuVision installation is complete",
      preheader: "Your service has reached the completed stage.",
      heading: "You’re ready to see clearly.",
      body: "Your installation has been marked complete. Thank you for choosing NuVision Auto Glass.",
      buttonLabel: "View service status",
    },
    reward_earned: {
      subject: `You earned a $${campaign.referrerReward} referral reward`,
      preheader: "The referred installation is complete and your reward is eligible.",
      heading: "Your referral was successful.",
      body: `The installation you referred is complete, so your $${campaign.referrerReward} reward is approved and queued for payment — normally within 30 days. You'll receive it ${campaign.rewardMethods}.`,
      buttonLabel: "Track my reward",
    },
    reward_paid: {
      subject: "Your NuVision referral reward was paid",
      preheader: "Your reward has been processed.",
      heading: "Reward processed.",
      body: `Your $${campaign.referrerReward} referral reward has been paid. Thanks for trusting us with someone you know — your link stays active, so keep sharing it.`,
      buttonLabel: "View reward details",
    },
  };

  const selected = templates[event];
  if (event === "appointment_scheduled" && campaign.customerOffer) {
    return { ...selected, body: `${selected.body} Your referral benefit: ${campaign.customerOffer}` };
  }
  return selected;
}
