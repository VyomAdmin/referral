import nodemailer from "nodemailer";

export type SendEmailInput = { to: string; subject: string; html: string; text?: string };
export type SendResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

// Gmail via SMTP + an app-specific password (not OAuth) — simplest setup for a
// single sending mailbox, no Google Cloud project or consent flow needed.
// GMAIL_SENDER_EMAIL/GMAIL_APP_PASSWORD unset => sendEmail no-ops with an
// explicit "not configured" result, same pattern as HubSpot/Twilio/ops-alerts.
// A fresh transporter per call (no module-level connection) — creation is
// cheap (no network I/O until sendMail), and it keeps this trivially mockable.
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const user = process.env.GMAIL_SENDER_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Gmail sending is not configured" };

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const info = await transporter.sendMail({ from: user, to: input.to, subject: input.subject, html: input.html, text: input.text });
    return { ok: true, providerMessageId: info.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown email send failure" };
  }
}
