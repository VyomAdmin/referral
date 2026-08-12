import assert from "node:assert/strict";
import test from "node:test";
import { createHubSpotV3Signature, hubSpotEventKey, mapHubSpotDealToPublicStatus, validateHubSpotV3Signature } from "../app/lib/hubspot.ts";

test("Closed Won does not mean installed without the completion signal", () => {
  assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: false, installationCompletedAt: null, rewardPaid: false }), "scheduled");
});

test("installation completion and reward payment map to safe public states", () => {
  assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: true, installationCompletedAt: "2026-08-11T10:00:00Z", rewardPaid: false }), "installed");
  assert.equal(mapHubSpotDealToPublicStatus({ dealStage: "closedwon", installationCompleted: true, installationCompletedAt: "2026-08-11T10:00:00Z", rewardPaid: true }), "paid");
});

test("webhook retry keys are stable and event-specific", () => {
  const event = { portalId: 12, subscriptionId: 34, eventId: 56, occurredAt: 1723370400000, subscriptionType: "deal.propertyChange", objectId: 78 };
  assert.equal(hubSpotEventKey(event), hubSpotEventKey({ ...event }));
  assert.notEqual(hubSpotEventKey(event), hubSpotEventKey({ ...event, eventId: 57 }));
});

test("validates current HubSpot v3 signatures and rejects expired requests", async () => {
  const now = 1723370400000;
  const timestamp = String(now - 1000);
  const input = { secret: "test-secret", method: "POST", uri: "https://example.com/api/webhooks/hubspot", body: '[{"eventId":1}]', timestamp };
  const signature = await createHubSpotV3Signature(input.secret, input.method, input.uri, input.body, input.timestamp);
  assert.equal(await validateHubSpotV3Signature({ ...input, signature, now }), true);
  assert.equal(await validateHubSpotV3Signature({ ...input, signature, now: now + 10 * 60 * 1000 }), false);
});
