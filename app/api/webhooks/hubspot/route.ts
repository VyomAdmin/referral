import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { webhookEvents } from "../../../../db/schema";
import { hubSpotEventKey, HubSpotWebhookEvent, validateHubSpotV3Signature } from "../../../lib/hubspot";
import { applyHubSpotDealEvent } from "../../../lib/hubspot-sync";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hubspot-signature-v3") ?? "";
  const timestamp = request.headers.get("x-hubspot-request-timestamp") ?? "";
  const secret = process.env.HUBSPOT_CLIENT_SECRET ?? "";

  if (!secret) return Response.json({ error: "HubSpot is not configured" }, { status: 503 });

  // App Runner terminates TLS at its load balancer and forwards this request
  // over plain HTTP, so request.url reports "http://" even though HubSpot
  // signed the "https://" URL it actually called. Rebuild the real external
  // URL from the forwarded-proto header, same as layout.tsx already does.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const externalUrl = forwardedProto ? request.url.replace(/^https?:/, `${forwardedProto}:`) : request.url;

  const valid = await validateHubSpotV3Signature({ secret, method: request.method, uri: externalUrl, body, timestamp, signature });
  if (!valid) {
    const ageSeconds = (Date.now() - Number(timestamp)) / 1000;
    console.error(`[hubspot-webhook] signature rejected. url=${externalUrl} ageSeconds=${ageSeconds}`);
    return Response.json({ error: "Invalid HubSpot signature" }, { status: 401 });
  }

  let events: HubSpotWebhookEvent[];
  try {
    const payload = JSON.parse(body) as HubSpotWebhookEvent | HubSpotWebhookEvent[];
    events = Array.isArray(payload) ? payload : [payload];
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const db = getDb();
  for (const event of events) {
    const idempotencyKey = hubSpotEventKey(event);

    // Record the delivery, but idempotencyKey alone doesn't mean "already
    // applied" — only processedAt does. If a prior delivery inserted this row
    // and then threw before finishing, processedAt is still null and this
    // retry must apply the event again, not skip it.
    const [inserted] = await db.insert(webhookEvents).values({
      idempotencyKey,
      provider: "hubspot",
      objectId: String(event.objectId),
      eventType: event.subscriptionType,
      propertyName: event.propertyName ?? null,
      propertyValue: event.propertyValue ?? null,
      payload: event,
    }).onConflictDoNothing().returning({ processedAt: webhookEvents.processedAt });

    const processedAt = inserted
      ? inserted.processedAt
      : (await db.select({ processedAt: webhookEvents.processedAt }).from(webhookEvents).where(eq(webhookEvents.idempotencyKey, idempotencyKey)).limit(1))[0]?.processedAt;

    if (processedAt) continue;

    if (event.subscriptionType === "deal.propertyChange") {
      await applyHubSpotDealEvent(event);
    }
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.idempotencyKey, idempotencyKey));
  }

  return Response.json({ accepted: events.length }, { status: 202 });
}
