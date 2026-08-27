import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { createContact, createDeal, findContactByEmailOrPhone, getDealProperties, getDealStageLabel, HubSpotApiError, resolvePicklistValue } from "../app/lib/hubspot-client.ts";

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
  const id = await createContact({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "6025550001", leadSource: "Referral" });
  assert.equal(id, "contact-2");
  assert.deepEqual(JSON.parse(capturedBody).properties, {
    firstname: "Jane",
    lastname: "Doe",
    email: "jane@example.com",
    phone: "6025550001",
    incoming_lead_source__c: "Referral",
  });
});

test("createContact recovers the existing contact id from a 409 conflict instead of throwing", async () => {
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ status: "error", message: "Contact already exists. Existing ID: 9988", category: "CONFLICT" }), { status: 409 }));
  const id = await createContact({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "6025550001", leadSource: "Referral" });
  assert.equal(id, "9988");
});

test("createContact still throws a 409 whose body doesn't name an existing id", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ status: "error", message: "Conflict" }), { status: 409 }));
  await assert.rejects(
    () => createContact({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "6025550001", leadSource: "Referral" }),
    (error: unknown) => error instanceof HubSpotApiError && error.status === 409,
  );
});

test("createDeal sends the pipeline, stage, lead source, contact association, extra properties, and notes", async () => {
  let capturedBody = "";
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({ id: "deal-1", properties: { dealstage: "1012021141" } }), { status: 201 });
  });
  const deal = await createDeal({
    contactId: "contact-2",
    dealName: "Jane Doe — AZ 85001",
    pipeline: "691581097",
    dealstage: "1012021141",
    leadSource: "Referral",
    contactPhone: "6025550001",
    extraProperties: { install_state: "Arizona", install_zip: "85001", veh_make__c: "Toyota" },
    installNotes: "Insurance Provider: Acme Mutual",
  });
  assert.deepEqual(deal, { id: "deal-1", stage: "1012021141" });
  const body = JSON.parse(capturedBody);
  assert.equal(body.properties.pipeline, "691581097");
  assert.equal(body.properties.dealstage, "1012021141");
  assert.equal(body.properties.incoming_lead_source__c, "Referral");
  assert.equal(body.properties.contact_phone_1__c, "6025550001");
  assert.equal(body.properties.install_state, "Arizona");
  assert.equal(body.properties.install_zip, "85001");
  assert.equal(body.properties.veh_make__c, "Toyota");
  assert.equal(body.properties.install_notes__c, "Insurance Provider: Acme Mutual");
  assert.equal(body.associations[0].to.id, "contact-2");
});

test("createDeal omits install_notes__c entirely when there are no notes", async () => {
  let capturedBody = "";
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({ id: "deal-2", properties: { dealstage: "1012021141" } }), { status: 201 });
  });
  await createDeal({
    contactId: "contact-3",
    dealName: "John Roe — FL 33101",
    pipeline: "691581097",
    dealstage: "1012021141",
    leadSource: "Referral",
    contactPhone: "3055550001",
  });
  const body = JSON.parse(capturedBody);
  assert.equal("install_notes__c" in body.properties, false);
});

// Each test below queries a distinct property name — getPropertyDefinition
// caches by "objectType:propertyName" for the life of the process, so reusing
// a name across tests with different mocked option lists would silently
// return a previous test's cached (and now stale) definition.
test("resolvePicklistValue matches case-insensitively against option value or label", async () => {
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ name: "veh_make__c", label: "Vehicle Make", type: "enumeration", options: [{ label: "Toyota", value: "toyota" }, { label: "Honda", value: "honda" }] }), { status: 200 }));
  assert.deepEqual(await resolvePicklistValue("deals", "veh_make__c", "TOYOTA"), { kind: "matched", value: "toyota" });
  assert.deepEqual(await resolvePicklistValue("deals", "veh_make__c", "honda"), { kind: "matched", value: "honda" });
});

test("resolvePicklistValue reports unmatched with the property's display label", async () => {
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ name: "insurance_provider_2", label: "Insurance Provider", type: "enumeration", options: [{ label: "GEICO", value: "geico" }] }), { status: 200 }));
  assert.deepEqual(await resolvePicklistValue("deals", "insurance_provider_2", "Delorean Mutual"), { kind: "unmatched", fieldLabel: "Insurance Provider" });
});

test("resolvePicklistValue treats non-enumeration properties and failed lookups as not-a-picklist", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ name: "model__c", label: "Model", type: "string", options: [] }), { status: 200 }));
  assert.deepEqual(await resolvePicklistValue("deals", "model__c", "Camry"), { kind: "not-a-picklist" });

  mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));
  assert.deepEqual(await resolvePicklistValue("deals", "unknown__c", "anything"), { kind: "not-a-picklist" });
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
