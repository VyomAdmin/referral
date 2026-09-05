import nodemailer from "nodemailer";
import { sendViaBrevo } from "./brevo.ts";

export type SendEmailInput = { to: string; subject: string; html: string; text?: string; tag?: string };
export type SendResult = { ok: true; providerMessageId: string; provider: EmailProvider } | { ok: false; error: string };
export type EmailProvider = "brevo" | "gmail";

const DEFAULT_SENDER_NAME = "NuVision Auto Glass";

// Provider selection, in order:
//   1. Brevo, when BREVO_API_KEY is set — the real transactional provider.
//      Gives delivery/open/bounce webhooks, which is what makes the admin
//      "Email activity" view work at all (audit C-04).
//   2. Gmail SMTP, when only GMAIL_* is set — the legacy path, kept so the
//      Brevo key can be added to production without a window where referral
//      emails silently stop. Remove the GMAIL_* secrets once Brevo is verified.
//   3. Neither: an explicit "not configured" result, never a throw — the same
//      no-op pattern as HubSpot/Twilio, so a missing provider degrades the
//      notification instead of failing the referral that triggered it.
export function configuredEmailProvider(): EmailProvider | null {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.GMAIL_AUTH_EMAIL && process.env.GMAIL_APP_PASSWORD) return "gmail";
  return null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const provider = configuredEmailProvider();
  if (!provider) return { ok: false, error: "No transactional email provider is configured" };
  return provider === "brevo" ? sendWithBrevo(input) : sendWithGmail(input);
}

async function sendWithBrevo(input: SendEmailInput): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY!;
  // The From address must be on a domain verified in Brevo (SPF/DKIM), or
  // Brevo rejects the send outright rather than silently landing in spam.
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_AUTH_EMAIL;
  if (!senderEmail) return { ok: false, error: "BREVO_SENDER_EMAIL is not set" };

  const result = await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: process.env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    tag: input.tag,
  });
  return result.ok ? { ok: true, providerMessageId: result.providerMessageId, provider: "brevo" } : result;
}

// Legacy Gmail path. GMAIL_AUTH_EMAIL is the mailbox SMTP logs into;
// GMAIL_FROM_EMAIL is the visible From and can be a branded alias, as long as
// it's a verified "Send mail as" identity on that account — Gmail returns 553
// for an unverified From otherwise.
async function sendWithGmail(input: SendEmailInput): Promise<SendResult> {
  const authEmail = process.env.GMAIL_AUTH_EMAIL!;
  const pass = process.env.GMAIL_APP_PASSWORD!;
  const fromEmail = process.env.GMAIL_FROM_EMAIL || authEmail;

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: authEmail, pass } });
    const info = await transporter.sendMail({ from: fromEmail, to: input.to, subject: input.subject, html: input.html, text: input.text });
    return { ok: true, providerMessageId: info.messageId, provider: "gmail" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown email send failure" };
  }
}
