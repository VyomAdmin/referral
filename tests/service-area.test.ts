import assert from "node:assert/strict";
import test from "node:test";
import { INSURANCE_PROVIDERS, isServiceableZipPrefix } from "../app/lib/service-area.ts";

test("isServiceableZipPrefix accepts a 3-digit prefix present in serviceableZips.json", () => {
  assert.equal(isServiceableZipPrefix("850"), true);
  assert.equal(isServiceableZipPrefix("85001"), true);
});

test("isServiceableZipPrefix rejects a prefix that's in-range but not in serviceableZips.json", () => {
  // 858 falls inside the old 850-865 numeric range but isn't a listed prefix.
  assert.equal(isServiceableZipPrefix("858"), false);
  assert.equal(isServiceableZipPrefix("85800"), false);
});

test("isServiceableZipPrefix rejects fewer than 3 digits and non-numeric input", () => {
  assert.equal(isServiceableZipPrefix("85"), false);
  assert.equal(isServiceableZipPrefix(""), false);
  assert.equal(isServiceableZipPrefix("abc"), false);
});

test("INSURANCE_PROVIDERS is a non-empty, deduplicated list", () => {
  assert.ok(INSURANCE_PROVIDERS.length > 50);
  assert.equal(new Set(INSURANCE_PROVIDERS).size, INSURANCE_PROVIDERS.length);
});

// An out-of-scope ZIP ends the interaction: the attempt is kept in Postgres for
// coverage analysis and goes no further. It must never reach HubSpot — an area
// we don't serve isn't a lead, and putting it in a sales pipeline would create
// a follow-up obligation nobody can honour.
test("the non-serviceable ZIP path touches the DB and nothing else", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/lib/service-area-actions.ts", import.meta.url), "utf8");
  assert.match(source, /nonServiceableZipAttempts/);
  assert.doesNotMatch(source, /hubspot|HubSpot/, "the out-of-area path must not call HubSpot");
  assert.doesNotMatch(source, /sendEmail|sendSms|notify/, "an unserviceable area gets no messaging");
});

test("the out-of-area screen offers no onward funnel", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/components/referral-journey.tsx", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("{unsupported ?"), source.indexOf("{campaign ?"));
  assert.match(block, /not serving this ZIP code yet/);
  // The interaction ends here: no quote form, no phone number, no booking path.
  assert.doesNotMatch(block, /get-a-quote|QUOTE_URL|Get a free quote/, "must not funnel to the quote form");
  assert.doesNotMatch(block, /SUPPORT_PHONE|tel:/, "must not offer a phone path");
});
