import assert from "node:assert/strict";
import test from "node:test";
import { campaignForZip, createReferralCode } from "../app/lib/referral-rules.ts";

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

test("supports South Carolina and Colorado local communication", () => {
  assert.equal(campaignForZip("29401")?.state, "SC");
  assert.equal(campaignForZip("80202")?.state, "CO");
});

test("rejects malformed and unsupported ZIP codes", () => {
  assert.equal(campaignForZip("8500"), null);
  assert.equal(campaignForZip("abcde"), null);
  assert.equal(campaignForZip("10001"), null);
});

test("creates branded referral codes without personal information", () => {
  assert.equal(createReferralCode("Sandeep", "Jha", 1723456789012), "NV-SJ-9012");
});
