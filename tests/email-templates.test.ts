import assert from "node:assert/strict";
import test from "node:test";
import { emailTemplate } from "../app/lib/email-templates.ts";
import { campaignForZip } from "../app/lib/referral-rules.ts";

test("Arizona customer email includes the active offer", () => {
  const campaign = campaignForZip("85001");
  assert.ok(campaign);
  const template = emailTemplate("appointment_scheduled", "Alex Smith", campaign);
  assert.match(template.body, /\$50 additional cash back/);
});

test("Florida customer email does not invent an offer", () => {
  const campaign = campaignForZip("33101");
  assert.ok(campaign);
  const template = emailTemplate("appointment_scheduled", "Alex Smith", campaign);
  assert.doesNotMatch(template.body, /\$50 additional cash back|\$50 off/);
});

test("reward email is created only as a reward lifecycle message", () => {
  const campaign = campaignForZip("85001");
  assert.ok(campaign);
  const earned = emailTemplate("reward_earned", "Sandeep Jha", campaign);
  assert.match(earned.subject, /earned a \$50 referral reward/);
  assert.match(earned.body, /installation is complete/);
});
