import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { emailEvents, webhookEvents } from "../../../../db/schema";
import { brevoEventKey, BrevoWebhookEvent, shouldAdvanceStatus, statusForBrevoEvent } from "../../../lib/brevo";

// Brevo does not sign its webhooks, so the endpoint is authenticated by an
// unguessable token that we generate and embed in the URL configured in Brevo
// (?token=... or an x-webhook-token header). Possession of the token is the
// proof, same trust model as a signed URL — which is why it must be compared in
// constant time and must never appear in a log line.
function tokenMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.BREVO_WEBHOOK_TOKEN ?? "";
  if (!expected) return Response.json({ error: "Brevo webhooks are not configured" }, { status: 503 });

  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
  if (!tokenMatches(provided, expected)) {
    console.error("[brevo-webhook] rejected a delivery with a bad or missing token");
    return Response.json({ error: "Invalid webhook token" }, { status: 401 });
  }

  const body = await request.text();
  let events: BrevoWebhookEvent[];
  try {
    const payload = JSON.parse(body) as BrevoWebhookEvent | BrevoWebhookEvent[];
    events = Array.isArray(payload) ? payload : [payload];
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const db = getDb();
  let applied = 0;

  for (const event of events) {
    const messageId = event["message-id"];
    const status = statusForBrevoEvent(event.event ?? "");
    // Unmapped events ("deferred") and events with no message to attach to are
    // acknowledged, not retried — returning an error would make Brevo redeliver
    // something we will never act on.
    if (!messageId || !status) continue;

    const idempotencyKey = brevoEventKey(event);

    // Same two-step as the HubSpot webhook: the row existing doesn't mean the
    // event was applied — only processedAt does. A delivery that inserted the
    // row and then failed must be reapplied on retry, not skipped.
    const [inserted] = await db.insert(webhookEvents).values({
      idempotencyKey,
      provider: "brevo",
      objectId: messageId,
      eventType: event.event,
      propertyName: "status",
      propertyValue: status,
      payload: event,
    }).onConflictDoNothing().returning({ processedAt: webhookEvents.processedAt });

    const processedAt = inserted
      ? inserted.processedAt
      : (await db.select({ processedAt: webhookEvents.processedAt }).from(webhookEvents).where(eq(webhookEvents.idempotencyKey, idempotencyKey)).limit(1))[0]?.processedAt;

    if (processedAt) continue;

    const [emailEvent] = await db
      .select({ id: emailEvents.id, status: emailEvents.status })
      .from(emailEvents)
      .where(eq(emailEvents.providerMessageId, messageId))
      .limit(1);

    // A send we have no record of (a Brevo email from outside this app, or one
    // whose row was pruned) is acknowledged and dropped.
    if (emailEvent && shouldAdvanceStatus(emailEvent.status, status)) {
      await db
        .update(emailEvents)
        .set({
          status,
          ...(event.reason ? { errorMessage: event.reason } : {}),
        })
        .where(eq(emailEvents.id, emailEvent.id));
      applied++;
    }

    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.idempotencyKey, idempotencyKey));
  }

  return Response.json({ received: events.length, applied });
}
