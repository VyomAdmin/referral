import assert from "node:assert/strict";
import test from "node:test";
import { campaignForZip, createReferralCode, isValidEmail, isValidPhone, normalizeVehicleText, stateName } from "../app/lib/referral-rules.ts";

test("routes Arizona ZIP codes to the Arizona offer", () => {
  const campaign = campaignForZip("85001");
  assert.equal(campaign?.state, "AZ");
  assert.match(campaign?.customerOffer ?? "", /\$50/);
});

test("routes Florida ZIP codes without a customer offer", () => {
  const campaign = campaignForZip("33101");
  assert.equal(campaign?.state, "FL");
  assert.equal(campaign?.customerOffer, null);
});

test("rejects malformed and unsupported ZIP codes", () => {
  assert.equal(campaignForZip("8500"), null);
  assert.equal(campaignForZip("abcde"), null);
  assert.equal(campaignForZip("10001"), null);
  assert.equal(campaignForZip("29401"), null);
  assert.equal(campaignForZip("80202"), null);
});

test("rejects a ZIP inside the old AZ/FL numeric range that serviceableZips.json doesn't actually list", () => {
  // 858 and 340 are within 850-865 / 320-349 but absent from serviceableZips.json.
  assert.equal(campaignForZip("85800"), null);
  assert.equal(campaignForZip("34000"), null);
});

test("creates branded referral codes without personal information", () => {
  assert.equal(createReferralCode("Sandeep", "Jha", 1723456789012), "NV-SJ-9012");
});

test("isValidPhone accepts a 10-digit US number in any common formatting", () => {
  assert.equal(isValidPhone("(602) 555-0123"), true);
  assert.equal(isValidPhone("6025550123"), true);
  assert.equal(isValidPhone("602.555.0123"), true);
  assert.equal(isValidPhone("+1 (602) 555-0123"), true);
  assert.equal(isValidPhone("16025550123"), true);
});

test("isValidPhone rejects wrong lengths and a non-US country code prefix", () => {
  assert.equal(isValidPhone("602-555-012"), false);
  assert.equal(isValidPhone("602-555-01234"), false);
  assert.equal(isValidPhone("26025550123"), false);
  assert.equal(isValidPhone(""), false);
  assert.equal(isValidPhone("abcdefghij"), false);
});

test("isValidEmail accepts a well-formed address", () => {
  assert.equal(isValidEmail("jane@example.com"), true);
  assert.equal(isValidEmail("jane.doe+referral@sub.example.co"), true);
});

test("isValidEmail rejects addresses missing an @ or a domain", () => {
  assert.equal(isValidEmail("jane@example"), false);
  assert.equal(isValidEmail("janeexample.com"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("jane@"), false);
});

test("stateName resolves the two-letter code to the full state name for HubSpot", () => {
  assert.equal(stateName("AZ"), "Arizona");
  assert.equal(stateName("FL"), "Florida");
});

// R-04: free-text vehicle make/model reached HubSpot in whatever casing the
// customer typed, fragmenting reports that group by make ("RAM" vs "Ram").
test("normalizeVehicleText collapses casing variants to one spelling", () => {
  assert.equal(normalizeVehicleText("RAM"), "RAM");
  assert.equal(normalizeVehicleText("ram"), "RAM");
  assert.equal(normalizeVehicleText("Ram"), "RAM");
  assert.equal(normalizeVehicleText("TOYOTA"), "Toyota");
  assert.equal(normalizeVehicleText("bmw"), "BMW");
});

test("normalizeVehicleText title-cases multi-word models and collapses whitespace", () => {
  assert.equal(normalizeVehicleText("  grand   cherokee "), "Grand Cherokee");
  assert.equal(normalizeVehicleText("GRAND CHEROKEE"), "Grand Cherokee");
});

test("normalizeVehicleText canonicalises known model spellings", () => {
  assert.equal(normalizeVehicleText("f150"), "F-150");
  assert.equal(normalizeVehicleText("cr-v"), "CR-V");
  assert.equal(normalizeVehicleText("rav4"), "RAV4");
});

test("normalizeVehicleText leaves an empty value empty", () => {
  assert.equal(normalizeVehicleText(""), "");
  assert.equal(normalizeVehicleText("   "), "");
});
