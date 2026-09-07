import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import schema from "./fixtures/hubspot-properties.json" with { type: "json" };

// Every property this app writes must actually exist on the object it's written
// to. A wrong property name doesn't degrade — HubSpot rejects the ENTIRE create
// with PROPERTY_DOESNT_EXIST, so one typo loses the whole contact or deal.
//
// This shipped: we sent "lead_source__c", which exists on neither object (the
// real names are "leadsource" on contacts and "lead_source" on deals), and we
// sent four contacts-only properties on the deal. It hid for days because
// createContact only runs when the person isn't already in HubSpot, so most
// syncs succeeded and the admin read "22 synced, 1 failed".
//
// The fixture is a trimmed snapshot of GET /crm/v3/properties/{object} from
// portal 48519458. Refresh it if the portal's schema changes — do not edit it
// to make a test pass.

const names = (object: "contacts" | "deals") => new Set(schema[object].properties.map((p) => p.name));

// Pulls the literal keys out of the `properties: { ... }` object in a request body.
function propertyKeysIn(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `could not find ${marker}`);
  const propsAt = source.indexOf("properties: {", start);
  assert.ok(propsAt >= 0, `no properties block after ${marker}`);
  let depth = 0;
  let end = propsAt;
  for (let i = source.indexOf("{", propsAt); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  // Strip comments first so commented-out property names don't count as sent.
  const block = stripComments(source.slice(propsAt, end));
  // Keys anywhere in the block, including inside conditional spreads such as
  // `...(x ? { referred_by: x } : {})` — those are still properties we send.
  return [...block.matchAll(/([a-z_][a-z0-9_]*)\s*:/gi)]
    .map((m) => m[1])
    .filter((key) => key !== "properties");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("every property written to a HubSpot contact exists on contacts", async () => {
  const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8");
  const keys = propertyKeysIn(source, '"/crm/v3/objects/contacts"');
  const valid = names("contacts");
  const unknown = keys.filter((key) => !valid.has(key));
  assert.deepEqual(unknown, [], `not real contact properties: ${unknown.join(", ")}`);
  // Guard the specific mistake that shipped.
  assert.ok(!keys.includes("lead_source__c"), "lead_source__c does not exist on contacts");
  assert.ok(keys.includes("leadsource"), "contacts' lead source property is 'leadsource'");
});

test("every property written to a HubSpot deal exists on deals", async () => {
  const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8");
  const keys = propertyKeysIn(source, '"/crm/v3/objects/deals"');
  const valid = names("deals");
  const unknown = keys.filter((key) => !valid.has(key));
  assert.deepEqual(unknown, [], `not real deal properties: ${unknown.join(", ")}`);
  assert.ok(!keys.includes("lead_source__c"), "lead_source__c does not exist on deals");
  assert.ok(keys.includes("lead_source"), "deals' lead source property is 'lead_source'");
});

// The four properties that only exist on contacts, and cost us the deal create.
test("contacts-only attribution properties are never sent on a deal", async () => {
  const source = await readFile(new URL("../app/lib/hubspot-client.ts", import.meta.url), "utf8");
  const dealKeys = propertyKeysIn(source, '"/crm/v3/objects/deals"');
  const contactKeys = propertyKeysIn(source, '"/crm/v3/objects/contacts"');
  for (const property of ["referralcode", "referred_by", "referral_email__c", "referral_phone__c"]) {
    assert.ok(!names("deals").has(property), `fixture drift: ${property} should be contacts-only`);
    assert.ok(!dealKeys.includes(property), `${property} must not be sent on a deal`);
    assert.ok(contactKeys.includes(property), `${property} should be set on the contact instead`);
  }
});

// Picklist VALUES degrade gracefully via resolvePicklistValue; these two don't
// go through it, so they have to be valid as written.
test("the lead-source values we send are real picklist options", () => {
  const option = (object: "contacts" | "deals", property: string) =>
    schema[object].properties.find((p) => p.name === property)?.options ?? [];
  assert.ok(option("contacts", "incoming_lead_source__c").includes("In-House Referral"));
  assert.ok(option("deals", "incoming_lead_source__c").includes("In-House Referral"));
  assert.ok(option("contacts", "leadsource").includes("Marketing"));
  assert.ok(option("deals", "lead_source").includes("Marketing"));
});
