// Brevo (formerly Sendinblue) transactional email. Replaces Gmail SMTP, which
// gave no delivery signal at all — the admin "Email activity" view could only
// ever show "Delivered 0, Opened 0, Bounced 0" because SMTP tells you nothing
// after the handshake. Brevo posts delivery/open/click/bounce webhooks back,
// which is what fills that view in.

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export type BrevoSendInput = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  // Surfaces in Brevo's own dashboard and comes back on every webhook, so a
  // send can be traced to the template that produced it without a DB lookup.
  tag?: string;
};

export type BrevoSendResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

export async function sendViaBrevo(input: BrevoSendInput, fetchImpl: typeof fetch = fetch): Promise<BrevoSendResult> {
  try {
    const response = await fetchImpl(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        "api-key": input.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: input.senderEmail, name: input.senderName },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        ...(input.text ? { textContent: input.text } : {}),
        ...(input.tag ? { tags: [input.tag] } : {}),
      }),
    });

    if (!response.ok) {
      // Brevo returns {code, message} on failure; fall back to the status line
      // if the body isn't the JSON we expect.
      const detail = await response.text().catch(() => "");
      let message = detail;
      try {
        const parsed = JSON.parse(detail) as { message?: string; code?: string };
        if (parsed.message) message = parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message;
      } catch {
        // keep the raw body
      }
      return { ok: false, error: `Brevo send failed (${response.status})${message ? `: ${message}` : ""}` };
    }

    const payload = (await response.json()) as { messageId?: string };
    if (!payload.messageId) return { ok: false, error: "Brevo accepted the send but returned no messageId" };
    return { ok: true, providerMessageId: payload.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown Brevo send failure" };
  }
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

export type BrevoWebhookEvent = {
  event: string;
  email?: string;
  "message-id"?: string;
  id?: number;
  ts?: number;
  date?: string;
  tag?: string;
  reason?: string;
};

// The statuses the admin Email activity view already counts. Kept in sync with
// EmailsView in admin-dashboard.tsx: delivered/opened/clicked feed "Delivered",
// opened/clicked feed "Opened", clicked feeds "Tracker clicks", bounced feeds
// "Bounced".
export type EmailStatus = "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "unsubscribed" | "failed";

const EVENT_STATUS: Record<string, EmailStatus> = {
  request: "sent",
  delivered: "delivered",
  opened: "opened",
  unique_opened: "opened",
  proxy_open: "opened",
  click: "clicked",
  hard_bounce: "bounced",
  soft_bounce: "bounced",
  blocked: "bounced",
  invalid_email: "bounced",
  spam: "bounced",
  error: "failed",
  unsubscribed: "unsubscribed",
  // "deferred" is a retry in progress, not an outcome — deliberately absent so
  // it leaves the recorded status alone.
};

// How far along the delivery funnel each status sits. Webhooks arrive out of
// order (an "opened" can land before its "delivered"), so a lower-ranked event
// must never overwrite a higher-ranked one — otherwise a late delivered event
// would silently un-open an email in the dashboard.
const STATUS_RANK: Record<EmailStatus, number> = {
  queued: 0,
  failed: 1,
  sent: 2,
  bounced: 3,
  unsubscribed: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
};

export function statusForBrevoEvent(event: string): EmailStatus | null {
  return EVENT_STATUS[event.toLowerCase()] ?? null;
}

export function shouldAdvanceStatus(current: string | null | undefined, next: EmailStatus): boolean {
  const currentRank = STATUS_RANK[(current ?? "queued") as EmailStatus];
  // An unrecognised stored status (hand-edited, or from an older build) is
  // treated as the floor, so a real webhook still gets to update it.
  return next !== "sent" && (currentRank === undefined || STATUS_RANK[next] > currentRank);
}

// Brevo doesn't sign its webhooks, so the endpoint is protected by an
// unguessable token we generate and put in the URL we hand Brevo. This is the
// same trust model as a signed URL: possession of the token is the proof.
export function brevoEventKey(event: BrevoWebhookEvent): string {
  const messageId = event["message-id"] ?? "unknown";
  // id+ts disambiguate repeated events of the same type for one message (e.g.
  // several opens), so genuine repeats aren't collapsed as duplicates while
  // provider retries of the *same* delivery still are.
  return `brevo:${messageId}:${event.event}:${event.id ?? ""}:${event.ts ?? event.date ?? ""}`;
}
