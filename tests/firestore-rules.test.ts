import { readFileSync } from "node:fs";
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-referral",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff/admin-1"), { email: "admin@example.com", role: "Admin", status: "active", twoFactorStatus: "off" });
    await setDoc(doc(db, "staff/ops-1"), { email: "ops@example.com", role: "Ops", status: "active", twoFactorStatus: "off" });
    await setDoc(doc(db, "staff/mkt-1"), { email: "mkt@example.com", role: "Marketing", status: "active", twoFactorStatus: "off" });
    await setDoc(doc(db, "referrals/ref-1"), { referrerId: "r", state: "FL", stage: "new_referral" });
    await setDoc(doc(db, "rewards/reward-1"), { referralId: "ref-1", status: "eligible", amount: null });
    await setDoc(doc(db, "campaign/default"), { active: false, rewardAmount: null });
    await setDoc(doc(db, "auditEvents/audit-1"), { actor: "admin-1", action: "test", target: "ref-1", time: "2026-10-19T00:00:00.000Z" });
    await setDoc(doc(db, "webhookEvents/evt-1"), { eventType: "OpportunityStageUpdate" });
  });
});

test.after(async () => {
  await env?.cleanup();
});

test("unsigned clients cannot read or write", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "referrals/ref-1")));
  await assertFails(setDoc(doc(db, "referrers/new"), { email: "a@example.com" }));
  await assertFails(getDoc(doc(db, "webhookEvents/evt-1")));
});

test("staff can read program data and cannot write it", async () => {
  const ops = env.authenticatedContext("ops-1").firestore();
  await assertSucceeds(getDoc(doc(ops, "referrals/ref-1")));
  await assertSucceeds(getDoc(doc(ops, "rewards/reward-1")));
  await assertFails(setDoc(doc(ops, "rewards/reward-1"), { status: "paid" }));
  await assertFails(setDoc(doc(ops, "campaign/default"), { active: true }));
  const marketing = env.authenticatedContext("mkt-1").firestore();
  await assertSucceeds(getDoc(doc(marketing, "campaign/default")));
  await assertFails(setDoc(doc(marketing, "campaign/default"), { offerText: "changed" }));
  await assertFails(getDoc(doc(marketing, "auditEvents/audit-1")));
  const admin = env.authenticatedContext("admin-1").firestore();
  await assertSucceeds(getDoc(doc(admin, "staff/ops-1")));
  await assertSucceeds(getDoc(doc(admin, "auditEvents/audit-1")));
  await assertFails(setDoc(doc(admin, "auditEvents/audit-2"), { actor: "admin-1", action: "forged", target: "x", time: "2026-10-19T00:00:00.000Z" }));
  await assertFails(getDoc(doc(admin, "webhookEvents/evt-1")));
});
