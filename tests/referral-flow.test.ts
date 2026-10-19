import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { readSiteConfig } from "../config/site.ts";
import { parseCoverageCsv, verifyEd25519Signature } from "../functions/src/domain.ts";
import { CrmError, GhlClient, UnconfiguredCrm, type Crm, type Messaging } from "../functions/src/ghl.ts";
import {
  handleWebhook,
  inviteStaff,
  markRewardPaid,
  quote,
  reconcile,
  retryPending,
  signup,
  trackCustomer,
  trackReferrer,
  updateCampaign,
  updateTemplates,
  type Deps,
} from "../functions/src/handlers.ts";
import { emptyTemplates, MemoryStore, type Staff } from "../functions/src/store.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function deps(partial?: { crm?: Crm; messaging?: Messaging }): Deps {
  const config = readSiteConfig({});
  config.ghlWebhookPublicKey = publicPem;
  return {
    store: new MemoryStore(),
    crm: partial?.crm ?? new UnconfiguredCrm(),
    messaging: partial?.messaging ?? new UnconfiguredCrm(),
    config,
    now: () => "2026-10-19T12:00:00.000Z",
    nowMs: () => Date.parse("2026-10-19T12:00:00.000Z"),
    id: (() => {
      let n = 0;
      return () => `id-${n++}`;
    })(),
    appCheckRequired: false,
    verifyAppCheck: async () => false,
    createUser: async (email) => ({ uid: `user-${email}` }),
  };
}

function formClock(base: Deps) {
  return base.nowMs() - 5_000;
}

async function activeCampaign(store: MemoryStore) {
  await store.saveCampaign({
    offerText: "",
    rewardAmount: null,
    customerBenefit: null,
    payoutLine: "",
    active: true,
    templates: emptyTemplates(),
  });
}

test("signup through paid reward uses the mocked CRM and does not move money", async () => {
  const calls: string[] = [];
  const crm: Crm = {
    async upsertContact(input) {
      calls.push(`contact:${input.tags.join(",")}`);
      return { contactId: `c-${input.email}` };
    },
    async createOpportunity(input) {
      calls.push(`opportunity:${input.stage}`);
      return { opportunityId: "opp-1" };
    },
    async getOpportunityStage() {
      return { stage: "appointment_booked", rawStageId: null, rawStageName: "Appointment booked" };
    },
  };
  const env = deps({ crm });
  await env.store.upsertCoverage([{ zip: "00000", state: "FL" }]);
  await activeCampaign(env.store as MemoryStore);
  const startedAt = formClock(env);
  const joined = await signup(env, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "5551112222", consent: true, smsConsent: true, startedAt });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.rewardAmount, "not set");
  const referrer = await env.store.findReferrerByEmail("ada@example.com");
  assert.ok(referrer);
  assert.match(referrer.smsConsentText, /PLACEHOLDER/);
  assert.equal(referrer.ghlContactId, "c-ada@example.com");

  const submitted = await quote(env, {
    referralCode: joined.code,
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.com",
    phone: "5553334444",
    zip: "00000",
    vehicleYear: "2020",
    vehicleMake: "Test",
    vehicleModel: "Car",
    consent: true,
    smsConsent: true,
    startedAt,
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal("rewardAmount" in submitted, false);
  const referral = await env.store.getReferral(submitted.referralId);
  assert.equal(referral?.state, "FL");
  assert.equal(referral?.ghlOpportunityId, "opp-1");
  assert.equal(referral?.syncPending, false);

  const booked = Buffer.from(JSON.stringify({ type: "OpportunityStageUpdate", id: "opp-1", webhookId: "evt-booked", stageName: "Appointment booked" }));
  const bookedResult = await handleWebhook(env, booked, sign(null, booked, privateKey).toString("base64"));
  assert.equal(bookedResult.status, 200);
  assert.equal(await env.store.findRewardByReferral(submitted.referralId), null);

  const done = Buffer.from(JSON.stringify({ type: "OpportunityStageUpdate", id: "opp-1", webhookId: "evt-done", stageName: "Install complete" }));
  const doneResult = await handleWebhook(env, done, sign(null, done, privateKey).toString("base64"));
  assert.equal(doneResult.status, 200);
  const again = await handleWebhook(env, done, sign(null, done, privateKey).toString("base64"));
  assert.equal(again.body.duplicate, true);
  const reward = await env.store.findRewardByReferral(submitted.referralId);
  assert.ok(reward);
  assert.equal(reward.status, "eligible");
  assert.equal(reward.amount, null);
  assert.equal(await env.store.listRewards().then((rows) => rows.length), 1);

  const ops: Staff = { id: "ops-1", email: "ops@example.com", name: "Ops", role: "Ops", twoFactorStatus: "off", status: "active", inviteTokenHash: null, inviteExpiresAt: null, createdAt: env.now() };
  await env.store.saveStaff(ops);
  const marketing: Staff = { ...ops, id: "mkt-1", email: "mkt@example.com", role: "Marketing" };
  await env.store.saveStaff(marketing);
  const denied = await markRewardPaid(env, { id: marketing.id, email: marketing.email }, reward.id);
  assert.equal(denied.ok, false);
  const paid = await markRewardPaid(env, { id: ops.id, email: ops.email }, reward.id);
  assert.equal(paid.ok, true);
  const stored = await env.store.getReward(reward.id);
  assert.equal(stored?.status, "paid");
  assert.equal(stored?.paidBy, "ops-1");
  assert.equal(stored?.paidAt, env.now());
  assert.equal("paymentMethod" in (stored ?? {}), false);
  const audit = await env.store.listAudit();
  assert.ok(audit.some((event) => event.action === "reward.marked_paid" && event.actor === "ops-1"));

  const referrerView = await trackReferrer(env, { email: "ada@example.com", phone: "5551112222" });
  assert.equal(referrerView.ok, true);
  if (referrerView.ok) assert.equal(referrerView.totals.rewardsPaid, 1);
  const customerView = await trackCustomer(env, { token: submitted.trackToken });
  assert.equal(customerView.ok, true);
  assert.equal("rewardStatus" in customerView, false);
  assert.equal(JSON.stringify(customerView).includes("eligible"), false);
  assert.deepEqual(calls.filter((call) => call.startsWith("contact:referred")), ["contact:referred"]);
});

test("self-referral and uncovered ZIP do not create a referral", async () => {
  const env = deps();
  await activeCampaign(env.store as MemoryStore);
  const startedAt = formClock(env);
  const joined = await signup(env, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "5551112222", consent: true, smsConsent: true, startedAt });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const self = await quote(env, { referralCode: joined.code, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "5559990000", zip: "00000", consent: true, smsConsent: true, startedAt });
  assert.equal(self.ok, false);
  await env.store.upsertCoverage([{ zip: "00000", state: "SC" }]);
  const own = await quote(env, { referralCode: joined.code, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "5550001111", zip: "00000", consent: true, smsConsent: true, startedAt });
  assert.equal(own.ok, false);
  const uncovered = await quote(env, { referralCode: joined.code, firstName: "Grace", lastName: "Hopper", email: "grace@example.com", phone: "5553334444", zip: "99999", consent: true, smsConsent: true, startedAt });
  assert.equal(uncovered.ok, false);
  const logged = await env.store.listUncoveredZips();
  assert.equal(logged.find((row) => row.zip === "99999")?.count, 1);
  assert.equal((await env.store.listReferrals()).length, 0);
});

test("unsigned webhook is rejected and a stage id map is honored", async () => {
  const env = deps();
  const raw = Buffer.from(JSON.stringify({ type: "OpportunityStageUpdate", id: "opp-x", webhookId: "evt-x" }));
  const missing = await handleWebhook(env, raw, null);
  assert.equal(missing.status, 401);
  env.config.ghlStageIds = { install_complete: "stage-install" };
  const body = Buffer.from(JSON.stringify({ type: "OpportunityStageUpdate", id: "missing", webhookId: "evt-y", pipelineStageId: "stage-install" }));
  const result = await handleWebhook(env, body, sign(null, body, privateKey).toString("base64"));
  assert.equal(result.status, 200);
  assert.equal(verifyEd25519Signature(body, "not-a-signature", publicPem), false);
});

test("campaign edits and invites follow roles", async () => {
  const sent: string[] = [];
  const messaging: Messaging = {
    async sendEmail(input) {
      sent.push(input.text);
      return { messageId: "m1" };
    },
    async sendSms() {
      return { messageId: "s1" };
    },
  };
  const env = deps({ messaging });
  const ops: Staff = { id: "ops-1", email: "ops@example.com", name: "Ops", role: "Ops", twoFactorStatus: "off", status: "active", inviteTokenHash: null, inviteExpiresAt: null, createdAt: env.now() };
  const admin: Staff = { ...ops, id: "admin-1", email: "admin@example.com", role: "Admin" };
  await env.store.saveStaff(ops);
  await env.store.saveStaff(admin);
  const blocked = await updateCampaign(env, { id: ops.id, email: ops.email }, { active: true });
  assert.equal(blocked.ok, false);
  const opened = await updateCampaign(env, { id: admin.id, email: admin.email }, { active: true, rewardAmount: null });
  assert.equal(opened.ok, true);
  const badTemplate = await updateTemplates(env, { id: admin.id, email: admin.email }, {
    ...emptyTemplates(),
    referralConfirmation: { subject: "Hello", body: "You get $50" },
  });
  assert.equal(badTemplate.ok, false);
  const invite = await inviteStaff(env, { id: admin.id, email: admin.email }, { name: "New Ops", email: "new@example.com", role: "Ops" });
  assert.equal(invite.ok, true);
  assert.match(sent[0] ?? "", /staff portal/i);
  const unsent = await inviteStaff(deps(), { id: "missing", email: "nope@example.com" }, { name: "A", email: "b@example.com", role: "Ops" });
  assert.equal(unsent.ok, false);
});

test("retries a failed CRM call and the nightly job reports a mismatch", async () => {
  let fail = true;
  const crm: Crm = {
    async upsertContact() {
      if (fail) throw new CrmError("unavailable", 503);
      return { contactId: "c-later" };
    },
    async createOpportunity() {
      return { opportunityId: "opp-later" };
    },
    async getOpportunityStage() {
      return { stage: "lost", rawStageId: null, rawStageName: "Lost" };
    },
  };
  const env = deps({ crm });
  const startedAt = formClock(env);
  await signup(env, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "5551112222", consent: true, smsConsent: true, startedAt });
  const pending = await env.store.findReferrerByEmail("ada@example.com");
  assert.equal(pending?.syncPending, true);
  fail = false;
  await retryPending(env);
  assert.equal((await env.store.findReferrerByEmail("ada@example.com"))?.syncPending, false);
  await env.store.upsertCoverage([{ zip: "00000", state: "FL" }]);
  await activeCampaign(env.store as MemoryStore);
  await quote(env, { referralCode: pending!.referralCode, firstName: "Grace", lastName: "Hopper", email: "grace@example.com", phone: "5553334444", zip: "00000", consent: true, smsConsent: true, startedAt });
  const report = await reconcile(env);
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.mismatches[0]?.ghlStage, "lost");
});

test("GHL client backs off on HTTP 429", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { status: 429, headers: { get: () => "0" }, text: async () => "" };
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ contact: { id: "c1" } }) };
  };
  const config = readSiteConfig({});
  config.ghlPrivateToken = "test-token";
  config.ghlLocationId = "location";
  const client = new GhlClient(config, fetchImpl, async () => {});
  const result = await client.upsertContact({ firstName: "A", lastName: "B", email: "a@example.com", phone: "5551112222", tags: ["referrer"], customFields: {} });
  assert.equal(result.contactId, "c1");
  assert.equal(calls, 2);
});

test("coverage CSV stays empty of invented rows and rejects a bad state", () => {
  const empty = parseCoverageCsv("zip,state\n");
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.errors, []);
  const bad = parseCoverageCsv("zip,state\n00000,TX\n");
  assert.deepEqual(bad.rows, []);
  assert.equal(bad.errors.length, 1);
});

test("App Check is required when the functions runtime is present", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /appCheckRequired: Boolean\(process\.env\.K_SERVICE\)/);
  assert.match(source, /maxInstances/);
});
