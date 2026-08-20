import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { createContact, createDeal, findContactByEmailOrPhone, getDealProperties, getDealStageLabel, HubSpotApiError } from "../app/lib/hubspot-client.ts";

const ORIGINAL_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

beforeEach(() => {
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token";
});

afterEach(() => {
  mock.reset();
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = ORIGINAL_TOKEN;
});

test("findContactByEmailOrPhone returns null when HubSpot has no match", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
  const id = await findContactByEmailOrPhone("nobody@example.com", "6025550000");
  assert.equal(id, null);
});

test("findContactByEmailOrPhone returns the matched contact id", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ results: [{ id: "contact-1" }] }), { status: 200 }));
  const id = await findContactByEmailOrPhone("someone@example.com", "6025550000");
  assert.equal(id, "contact-1");
});

test("createContact posts the form fields and returns the new contact id", async () => {
  let capturedBody = "";
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({ id: "contact-2" }), { status: 201 });
  });
  const id = await createContact({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "6025550001" });
  assert.equal(id, "contact-2");
  assert.deepEqual(JSON.parse(capturedBody).properties, { firstname: "Jane", lastname: "Doe", email: "jane@example.com", phone: "6025550001" });
});

test("createDeal sends the pipeline, stage, lead source, and contact association", async () => {
  let capturedBody = "";
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({ id: "deal-1", properties: { dealstage: "1012021141" } }), { status: 201 });
  });
  const deal = await createDeal({ contactId: "contact-2", dealName: "Jane Doe — AZ 85001", pipeline: "691581097", dealstage: "1012021141", leadSource: "Referral" });
  assert.deepEqual(deal, { id: "deal-1", stage: "1012021141" });
  const body = JSON.parse(capturedBody);
  assert.equal(body.properties.pipeline, "691581097");
  assert.equal(body.properties.dealstage, "1012021141");
  assert.equal(body.properties.incoming_lead_source__c, "Referral");
  assert.equal(body.associations[0].to.id, "contact-2");
});

test("a non-2xx HubSpot response surfaces as HubSpotApiError with the status code", async () => {
  mock.method(globalThis, "fetch", async () => new Response("nope", { status: 429 }));
  await assert.rejects(() => findContactByEmailOrPhone("a@example.com", "1"), (error: unknown) => error instanceof HubSpotApiError && error.status === 429);
});

test("missing token throws HubSpotApiError instead of making a request", async () => {
  delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  const fetchMock = mock.method(globalThis, "fetch");
  await assert.rejects(() => findContactByEmailOrPhone("a@example.com", "1"), HubSpotApiError);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("getDealStageLabel resolves the numeric stage id to its display label", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ stages: [{ id: "1012021141", label: "New" }] }), { status: 200 }));
  const label = await getDealStageLabel("pipeline-a", "1012021141");
  assert.equal(label, "New");
});

test("getDealStageLabel caches the pipeline's stage list across calls", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ stages: [{ id: "s1", label: "Stage One" }] }), { status: 200 }));
  await getDealStageLabel("pipeline-b", "s1");
  await getDealStageLabel("pipeline-b", "s1");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("getDealStageLabel falls back to the raw id when the stage isn't found or the lookup fails", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ stages: [{ id: "other", label: "Other" }] }), { status: 200 }));
  assert.equal(await getDealStageLabel("pipeline-c", "unknown-id"), "unknown-id");

  mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));
  assert.equal(await getDealStageLabel("pipeline-d", "some-id"), "some-id");
});

test("getDealProperties requests the given properties and returns the deal's property bag", async () => {
  let requestedUrl = "";
  mock.method(globalThis, "fetch", async (url: string) => {
    requestedUrl = url;
    return new Response(JSON.stringify({ properties: { dealstage: "1012021141", status_code__c: "Install Completed" } }), { status: 200 });
  });
  const properties = await getDealProperties("deal-1", ["dealstage", "status_code__c"]);
  assert.deepEqual(properties, { dealstage: "1012021141", status_code__c: "Install Completed" });
  assert.match(requestedUrl, /\/crm\/v3\/objects\/deals\/deal-1\?properties=dealstage%2Cstatus_code__c/);
});
