import assert from "node:assert/strict";
import test from "node:test";
import type { AdminReferral } from "../app/lib/admin-data.ts";
import { canMarkRewardPaid, rewardEligible, searchReferrals } from "../app/lib/admin-rules.ts";

const demoReferrals: AdminReferral[] = [
  { id: "REF-482190", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Priya Mehta", customerEmail: "priya@example.com", phone: "(602) 555-0189", state: "AZ", zip: "85001", status: "scheduled", hubspotDealId: "18492011", hubspotStage: "Appointment Scheduled", submittedAt: "Aug 10, 2026", installedAt: null, rewardAmount: 50, syncStatus: "synced", syncError: null },
  { id: "REF-482041", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Carlos Ruiz", customerEmail: "carlos@example.com", phone: "(480) 555-0114", state: "AZ", zip: "85281", status: "installed", hubspotDealId: "18471220", hubspotStage: "Closed Won", submittedAt: "Aug 6, 2026", installedAt: "Aug 9, 2026", rewardAmount: 50, syncStatus: "synced", syncError: null },
  { id: "REF-479812", code: "NV-SJ-9012", referrer: "Sandeep Jha", referrerEmail: "sandeep@example.com", customer: "Avery Thomas", customerEmail: "avery@example.com", phone: "(623) 555-0160", state: "AZ", zip: "85250", status: "paid", hubspotDealId: "18398002", hubspotStage: "Closed Won", submittedAt: "Jul 24, 2026", installedAt: "Jul 29, 2026", rewardAmount: 50, syncStatus: "synced", syncError: null },
  { id: "REF-482201", code: "NV-RK-1048", referrer: "Romy Kaur", referrerEmail: "romy@nuvisionautoglass.com", customer: "Maya Wilson", customerEmail: "maya@example.com", phone: "(305) 555-0131", state: "FL", zip: "33101", status: "received", hubspotDealId: "18492291", hubspotStage: "New Lead", submittedAt: "Aug 11, 2026", installedAt: null, rewardAmount: 50, syncStatus: "pending", syncError: null },
];

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
