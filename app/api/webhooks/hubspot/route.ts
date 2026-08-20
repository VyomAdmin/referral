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
    const [inserted] = await db.insert(webhookEvents).values({
      idempotencyKey: hubSpotEventKey(event),
      provider: "hubspot",
      objectId: String(event.objectId),
      eventType: event.subscriptionType,
      propertyName: event.propertyName ?? null,
      propertyValue: event.propertyValue ?? null,
      payload: event,
    }).onConflictDoNothing().returning({ idempotencyKey: webhookEvents.idempotencyKey });

    // Only apply the event once — a retried/duplicate delivery hits onConflictDoNothing
    // above and returns no row, so it's skipped here too.
    if (inserted && event.subscriptionType === "deal.propertyChange") {
      await applyHubSpotDealEvent(event);
    }
  }

  return Response.json({ accepted: events.length }, { status: 202 });
}
