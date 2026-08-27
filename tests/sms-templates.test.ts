import assert from "node:assert/strict";
import test from "node:test";
import { smsTemplate } from "../app/lib/sms-templates.ts";
import { campaignForZip } from "../app/lib/referral-rules.ts";

test("welcome SMS includes the reward amount and stays reasonably short", () => {
  const campaign = campaignForZip("85001");
  assert.ok(campaign);
  const message = smsTemplate("referrer_welcome", "Jane Doe", campaign);
  assert.match(message, /\$50/);
  assert.match(message, /^Hi Jane,/);
  assert.ok(message.length <= 320, `SMS body is ${message.length} chars, expected <=320 (2 segments)`);
});

test("reward_paid SMS confirms payment, not eligibility", () => {
  const campaign = campaignForZip("33101");
  assert.ok(campaign);
  const message = smsTemplate("reward_paid", "Alex", campaign);
  assert.match(message, /has been paid/);
});

test("every event produces a non-empty message with an opt-out line", () => {
  const campaign = campaignForZip("85001");
  assert.ok(campaign);
  const events = ["referrer_welcome", "referral_received", "appointment_scheduled", "installation_completed", "reward_earned", "reward_paid"] as const;
  for (const event of events) {
    const message = smsTemplate(event, "Jane", campaign);
    assert.ok(message.length > 0, `${event} produced an empty message`);
    assert.match(message, /Reply STOP to opt out/);
  }
});
