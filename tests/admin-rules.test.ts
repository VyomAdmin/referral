import assert from "node:assert/strict";
import test from "node:test";
import { demoReferrals } from "../app/lib/admin-data.ts";
import { canMarkRewardPaid, rewardEligible, searchReferrals } from "../app/lib/admin-rules.ts";

test("only installed referrals with an installation timestamp are reward eligible", () => {
  const scheduled = demoReferrals.find((referral) => referral.status === "scheduled");
  const installed = demoReferrals.find((referral) => referral.status === "installed");
  assert.ok(scheduled && installed);
  assert.equal(rewardEligible(scheduled), false);
  assert.equal(rewardEligible(installed), true);
  assert.equal(canMarkRewardPaid(installed), true);
});

test("closed-won text alone cannot unlock a reward", () => {
  const installed = demoReferrals.find((referral) => referral.status === "installed");
  assert.ok(installed);
  assert.equal(rewardEligible({ ...installed, status: "scheduled", installedAt: null, hubspotStage: "Closed Won" }), false);
});

test("global referral search covers people, contact details, code, and HubSpot ID", () => {
  assert.equal(searchReferrals(demoReferrals, "Priya").length, 1);
  assert.equal(searchReferrals(demoReferrals, "305").length, 1);
  assert.equal(searchReferrals(demoReferrals, "NV-SJ-9012").length, 3);
  assert.equal(searchReferrals(demoReferrals, "18471220")[0]?.customer, "Carlos Ruiz");
});
