import assert from "node:assert/strict";
import test from "node:test";
import { computeDealEventUpdate } from "../app/lib/hubspot-sync.ts";
import type { ReferralDealState } from "../app/lib/hubspot-sync.ts";
import type { HubSpotWebhookEvent } from "../app/lib/hubspot.ts";

const baseReferral: ReferralDealState = { publicStatus: "received", hubspotStage: "New", installationCompletedAt: null };

function dealEvent(propertyName: string, propertyValue: string): HubSpotWebhookEvent {
  return { eventId: 1, subscriptionId: 1, portalId: 1, occurredAt: 1723370400000, subscriptionType: "deal.propertyChange", objectId: "deal-1", propertyName, propertyValue };
}

test("a dealstage change updates hubspotStage and recomputes publicStatus", () => {
  const update = computeDealEventUpdate(baseReferral, dealEvent("dealstage", "Closed Won"));
  assert.equal(update?.hubspotStage, "Closed Won");
  assert.equal(update?.publicStatus, "scheduled");
  assert.equal(update?.installationCompletedAt, undefined);
});

test("status_code__c = Install Completed stamps installationCompletedAt and marks installed", () => {
  const update = computeDealEventUpdate(baseReferral, dealEvent("status_code__c", "Install Completed"));
  assert.ok(update?.installationCompletedAt instanceof Date);
  assert.equal(update?.publicStatus, "installed");
});

test("an unrelated status_code__c value is ignored", () => {
  const update = computeDealEventUpdate(baseReferral, dealEvent("status_code__c", "In Progress"));
  assert.equal(update, null);
});

test("installationCompletedAt is never overwritten once already set", () => {
  const already = { ...baseReferral, installationCompletedAt: new Date("2026-08-01T00:00:00Z") };
  const update = computeDealEventUpdate(already, dealEvent("status_code__c", "Install Completed"));
  assert.equal(update, null);
});

test("a webhook can never regress a referral that is already paid", () => {
  const paid = { ...baseReferral, publicStatus: "paid" };
  const update = computeDealEventUpdate(paid, dealEvent("dealstage", "New"));
  assert.equal(update, null);
});

test("closed-won stage text alone still cannot reach installed without the completion signal", () => {
  const update = computeDealEventUpdate(baseReferral, dealEvent("dealstage", "Closed Won"));
  assert.equal(update?.publicStatus, "scheduled");
});
