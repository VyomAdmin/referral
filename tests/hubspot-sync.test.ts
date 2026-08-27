import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { computeDealEventUpdate, resolveDealFields } from "../app/lib/hubspot-sync.ts";
import type { ReferralDealState } from "../app/lib/hubspot-sync.ts";
import type { HubSpotWebhookEvent } from "../app/lib/hubspot.ts";

const ORIGINAL_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

beforeEach(() => {
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token";
});

afterEach(() => {
  mock.reset();
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = ORIGINAL_TOKEN;
});

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

test("publicStatus never regresses when a rep moves a deal backward in HubSpot", () => {
  const scheduled: ReferralDealState = { publicStatus: "scheduled", hubspotStage: "Appointment Scheduled", installationCompletedAt: null };
  const update = computeDealEventUpdate(scheduled, dealEvent("dealstage", "New"));
  // hubspotStage still records HubSpot's true current state...
  assert.equal(update?.hubspotStage, "New");
  // ...but the customer-facing publicStatus does not regress back to "received".
  assert.equal(update?.publicStatus, "scheduled");
});

test("publicStatus still advances forward normally after a prior stage regression", () => {
  const scheduled: ReferralDealState = { publicStatus: "scheduled", hubspotStage: "New", installationCompletedAt: null };
  const update = computeDealEventUpdate(scheduled, dealEvent("status_code__c", "Install Completed"));
  assert.equal(update?.publicStatus, "installed");
});

function propertyDefinition(name: string, label: string, options: { label: string; value: string }[]) {
  return { name, label, type: "enumeration", options };
}

test("resolveDealFields matches picklist values case-insensitively and passes non-picklist values through", async () => {
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("resolve-state-a")) return new Response(JSON.stringify(propertyDefinition("resolve-state-a", "State", [{ label: "Arizona", value: "arizona" }])), { status: 200 });
    if (url.includes("resolve-notes-field")) return new Response(JSON.stringify({ name: "resolve-notes-field", label: "Model", type: "string", options: [] }), { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });

  const { properties, notes } = await resolveDealFields([
    { property: "resolve-state-a", value: "ARIZONA" },
    { property: "resolve-notes-field", value: "Camry" },
  ]);
  assert.deepEqual(properties, { "resolve-state-a": "arizona", "resolve-notes-field": "Camry" });
  assert.equal(notes, "");
});

test("resolveDealFields routes an unmatched picklist value into notes instead of the property, keyed by the field's label", async () => {
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify(propertyDefinition("resolve-insurance-b", "Insurance Provider", [{ label: "GEICO", value: "geico" }])), { status: 200 }));

  const { properties, notes } = await resolveDealFields([{ property: "resolve-insurance-b", value: "Acme Mutual" }]);
  assert.deepEqual(properties, {});
  assert.equal(notes, "Insurance Provider: Acme Mutual");
});

test("resolveDealFields skips candidates with no value and joins multiple unmatched notes with newlines", async () => {
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("resolve-make-c")) return new Response(JSON.stringify(propertyDefinition("resolve-make-c", "Vehicle Make", [{ label: "Toyota", value: "toyota" }])), { status: 200 });
    if (url.includes("resolve-provider-c")) return new Response(JSON.stringify(propertyDefinition("resolve-provider-c", "Insurance Provider", [{ label: "GEICO", value: "geico" }])), { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });

  const { properties, notes } = await resolveDealFields([
    { property: "resolve-make-c", value: "Delorean" },
    { property: "resolve-provider-c", value: null },
    { property: "resolve-provider-c", value: "Acme Mutual" },
  ]);
  assert.deepEqual(properties, {});
  assert.equal(notes, "Vehicle Make: Delorean\nInsurance Provider: Acme Mutual");
});
