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
      preheader: "Share your link and track successful referrals in one place.",
      heading: `Welcome, ${firstName}.`,
      body: `Your personal referral link is ready. You can earn $${campaign.referrerReward} after each eligible installation is completed.`,
      buttonLabel: "View & share my link",
    },
    referral_received: {
      subject: "Your NuVision referral was received",
      preheader: "We have your referral and will keep you updated.",
      heading: "A referral just came in.",
      body: `We received a new ${campaign.stateName} referral through your link. We’ll let you know as it progresses.`,
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
      body: `The installation is complete, so your $${campaign.referrerReward} reward is now ready to process.`,
      buttonLabel: "Track my reward",
    },
    reward_paid: {
      subject: "Your NuVision referral reward was paid",
      preheader: "Your reward has been processed.",
      heading: "Reward processed.",
      body: `Your $${campaign.referrerReward} referral reward is marked paid. Thanks for spreading the word.`,
      buttonLabel: "View reward details",
    },
  };

  const selected = templates[event];
  if (event === "appointment_scheduled" && campaign.customerOffer) {
    return { ...selected, body: `${selected.body} Your referral benefit: ${campaign.customerOffer}` };
  }
  return selected;
}
