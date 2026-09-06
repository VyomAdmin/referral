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
  // The reward must always be tied to a completed installation, not merely to
  // a won deal — matched on intent rather than exact phrasing so the copy can
  // be reworded without silently losing the guarantee.
  assert.match(earned.body, /installation/i);
  assert.match(earned.body, /complete/i);
});

// B-07: no referrer email may imply money is owed before the installation is
// done. The old active template's subject was "your $50 reward is ready!" and
// it went out at signup, because template selection ignored the event.
test("pre-installation emails never claim a reward is ready or paid", () => {
  const campaign = campaignForZip("85001");
  assert.ok(campaign);
  for (const event of ["referrer_welcome", "referral_received", "appointment_scheduled"] as const) {
    const template = emailTemplate(event, "Sandeep Jha", campaign);
    const copy = `${template.subject} ${template.body} ${template.preheader}`;
    assert.doesNotMatch(copy, /reward is ready/i, `${event} implies the reward is ready`);
    assert.doesNotMatch(copy, /reward (has been |was )?paid/i, `${event} implies the reward was paid`);
    assert.doesNotMatch(copy, /you('ve| have) earned/i, `${event} claims the reward is earned`);
  }
});
