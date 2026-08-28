import nodemailer from "nodemailer";

export type SendEmailInput = { to: string; subject: string; html: string; text?: string };
export type SendResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

// Gmail via SMTP + an app-specific password (not OAuth) — simplest setup for a
// single sending mailbox, no Google Cloud project or consent flow needed.
// GMAIL_AUTH_EMAIL/GMAIL_APP_PASSWORD unset => sendEmail no-ops with an
// explicit "not configured" result, same pattern as HubSpot/Twilio/ops-alerts.
//
// GMAIL_AUTH_EMAIL is the real mailbox SMTP logs into; GMAIL_FROM_EMAIL is the
// visible From address, and can be a different, branded alias (e.g.
// referrals@nuvisionautoglass.com) as long as it's registered as a verified
// "Send mail as" identity on that real account — Gmail rejects an unverified
// From with a 553 error otherwise. Defaults to GMAIL_AUTH_EMAIL when unset,
// for the simpler case where the sending mailbox already has the address you want.
//
// A fresh transporter per call (no module-level connection) — creation is
// cheap (no network I/O until sendMail), and it keeps this trivially mockable.
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const authEmail = process.env.GMAIL_AUTH_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!authEmail || !pass) return { ok: false, error: "Gmail sending is not configured" };
  const fromEmail = process.env.GMAIL_FROM_EMAIL || authEmail;

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: authEmail, pass } });
    const info = await transporter.sendMail({ from: fromEmail, to: input.to, subject: input.subject, html: input.html, text: input.text });
    return { ok: true, providerMessageId: info.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown email send failure" };
  }
}
