import { getDb } from "../../../../db";
import { webhookEvents } from "../../../../db/schema";
import { hubSpotEventKey, HubSpotWebhookEvent, validateHubSpotV3Signature } from "../../../lib/hubspot";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hubspot-signature-v3") ?? "";
  const timestamp = request.headers.get("x-hubspot-request-timestamp") ?? "";
  const secret = process.env.HUBSPOT_CLIENT_SECRET ?? "";

  if (!secret) return Response.json({ error: "HubSpot is not configured" }, { status: 503 });
  const valid = await validateHubSpotV3Signature({ secret, method: request.method, uri: request.url, body, timestamp, signature });
  if (!valid) return Response.json({ error: "Invalid HubSpot signature" }, { status: 401 });

  let events: HubSpotWebhookEvent[];
  try {
    const payload = JSON.parse(body) as HubSpotWebhookEvent | HubSpotWebhookEvent[];
    events = Array.isArray(payload) ? payload : [payload];
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const db = getDb();
  for (const event of events) {
    await db.insert(webhookEvents).values({
      idempotencyKey: hubSpotEventKey(event),
      provider: "hubspot",
      objectId: String(event.objectId),
      eventType: event.subscriptionType,
      propertyName: event.propertyName ?? null,
      propertyValue: event.propertyValue ?? null,
      payload: event,
    }).onConflictDoNothing();
  }

  return Response.json({ accepted: events.length }, { status: 202 });
}
