import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { CleanupAbort, formatPlan, planCleanup, runCleanup, type SqlExecutor } from "../app/lib/test-data-cleanup.ts";

// This script deletes production rows. The only acceptable evidence that its
// match pattern is right is a real Postgres engine with real foreign keys,
// holding a mix of test and genuine data, asserting that the genuine data
// survives. PGlite gives us that without Docker.

const MIGRATIONS_DIR = path.resolve(fileURLToPath(new URL("../drizzle", import.meta.url)));

function statementsOf(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !/^(--[^\n]*\n?)+$/.test(chunk));
}

async function freshDb() {
  const db = await PGlite.create();
  for (const file of (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")).sort()) {
    for (const statement of statementsOf(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"))) {
      await db.exec(statement);
    }
  }
  return db;
}

function executor(db: PGlite): SqlExecutor {
  return async (sql, params) => {
    const result = await db.query(sql, params as unknown[]);
    return { rows: (result.rows ?? []) as Record<string, unknown>[] };
  };
}

/** Seeds one real referrer with a real referral, and test data around it. */
async function seed(db: PGlite) {
  const q = executor(db);
  await q(`insert into organizations (id, slug, name, brand_name) values ('org1','nuvision','NuVision','NuVision')`);
  await q(`insert into campaigns (id, organization_id, name, state, service_message, zip_rule) values ('camp-az','org1','AZ','AZ','msg','rule')`);

  // Real referrer, real customer — must survive untouched.
  await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-real','org1','NV-RE-0001','Real','Person','real@nuvisionautoglass.com','6025550100')`);
  await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, state, consent_given_at) values ('ref-real','org1','camp-az','rer-real','Real','Customer','customer@gmail.com','6025550101','85001','AZ', now())`);
  await q(`insert into email_events (id, organization_id, referral_id, referrer_id, template_key, recipient) values ('ee-real','org1','ref-real','rer-real','referrer_welcome','real@nuvisionautoglass.com')`);
  await q(`insert into tracker_tokens (id, kind, referrer_id, token_hash, expires_at) values ('tok-real','referrer','rer-real','hash-real', now() + interval '90 days')`);

  // Test referrer with a test referral, plus dependent rows in every table.
  await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-test','org1','NV-MA-5373','Maria','Alpha','maria.alpha.e2e@example.com','6025550102')`);
  await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, state, consent_given_at) values ('ref-test','org1','camp-az','rer-test','Alex','AlphaInstalled','alex.alpha.e2e@example.com','6025550103','85001','AZ', now())`);
  await q(`insert into email_events (id, organization_id, referral_id, referrer_id, template_key, recipient) values ('ee-test','org1','ref-test','rer-test','referrer_welcome','maria.alpha.e2e@example.com')`);
  await q(`insert into sms_events (id, organization_id, referral_id, referrer_id, template_key, recipient) values ('se-test','org1','ref-test','rer-test','referrer_welcome','6025550102')`);
  await q(`insert into tracker_tokens (id, kind, referral_id, referrer_id, token_hash, expires_at) values ('tok-test','customer','ref-test','rer-test','hash-test', now() + interval '90 days')`);
  await q(`insert into referral_events (id, referral_id, event_type, source, summary, occurred_at) values ('rev-test','ref-test','created','test','seeded', now())`);
  await q(`insert into rewards (id, referral_id, amount_cents) values ('rw-test','ref-test',5000)`);
  await q(`insert into non_serviceable_zip_attempts (id, organization_id, zip, referrer_code) values ('z-test','org1','99999','NV-MA-5373')`);

  // A test CUSTOMER referred by the REAL referrer. The referral is test data;
  // the referrer must survive.
  await q(`insert into referrals (id, organization_id, campaign_id, referrer_id, customer_first_name, customer_last_name, customer_email, customer_phone, zip, state, consent_given_at) values ('ref-mixed','org1','camp-az','rer-real','Jordan','Test','jordan.e2e@example.com','6025550104','85001','AZ', now())`);

  // Audit trail referencing a deleted referral — must be preserved.
  await q(`insert into audit_events (id, organization_id, actor_id, action, target_type, target_id) values ('aud-1','org1','user-1','referral.paid','referral','ref-test')`);
}

async function ids(db: PGlite, table: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select id from ${table} order by id`);
  return rows.map((r) => r.id);
}

test("plan matches only @example.com rows, including a test customer under a real referrer", async () => {
  const db = await freshDb();
  await seed(db);

  const plan = await planCleanup(executor(db));

  assert.deepEqual(plan.referrers.map((r) => r.email), ["maria.alpha.e2e@example.com"]);
  assert.deepEqual(plan.referrals.map((r) => r.id).sort(), ["ref-mixed", "ref-test"]);

  const mixed = plan.referrals.find((r) => r.id === "ref-mixed")!;
  assert.equal(mixed.reason, "test customer", "a test customer under a real referrer must still be removed");

  // The real referral is nowhere in the plan.
  assert.ok(!plan.referrals.some((r) => r.id === "ref-real"));
  await db.close();
});

test("cleanup deletes every dependent row and leaves real data intact", async () => {
  const db = await freshDb();
  await seed(db);
  const q = executor(db);

  const counts = await runCleanup(q, await planCleanup(q));

  assert.equal(counts.referrers, 1);
  assert.equal(counts.referrals, 2, "the test referral and the test customer under the real referrer");
  assert.equal(counts.emailEvents, 1);
  assert.equal(counts.smsEvents, 1);
  assert.equal(counts.trackerTokens, 1);
  assert.equal(counts.referralEvents, 1);
  assert.equal(counts.rewards, 1);
  assert.equal(counts.zipAttempts, 1);

  // Real data survives, untouched.
  assert.deepEqual(await ids(db, "referrers"), ["rer-real"]);
  assert.deepEqual(await ids(db, "referrals"), ["ref-real"]);
  assert.deepEqual(await ids(db, "email_events"), ["ee-real"]);
  assert.deepEqual(await ids(db, "tracker_tokens"), ["tok-real"]);

  // The audit trail is never erased by cleanup.
  assert.deepEqual(await ids(db, "audit_events"), ["aud-1"]);
  await db.close();
});

test("cleanup is idempotent — a second run finds nothing and changes nothing", async () => {
  const db = await freshDb();
  await seed(db);
  const q = executor(db);

  await runCleanup(q, await planCleanup(q));
  const second = await runCleanup(q, await planCleanup(q));

  assert.deepEqual(second, { emailEvents: 0, smsEvents: 0, trackerTokens: 0, referralEvents: 0, rewards: 0, referrals: 0, referrers: 0, zipAttempts: 0 });
  assert.deepEqual(await ids(db, "referrers"), ["rer-real"]);
  await db.close();
});

test("the safety limit aborts before deleting anything", async () => {
  const db = await freshDb();
  await seed(db);
  const q = executor(db);
  const plan = await planCleanup(q);

  await assert.rejects(() => runCleanup(q, plan, { maxDeletions: 1 }), CleanupAbort);

  // Nothing was deleted — the abort happens before the transaction opens.
  assert.deepEqual((await ids(db, "referrers")).sort(), ["rer-real", "rer-test"]);
  await db.close();
});

test("an address merely containing example.com is not matched", async () => {
  const db = await freshDb();
  await seed(db);
  const q = executor(db);

  await q(`insert into referrers (id, organization_id, code, first_name, last_name, email, phone) values ('rer-tricky','org1','NV-TR-0002','Tricky','Name','someone@example.com.really-real.co','6025550105')`);

  const plan = await planCleanup(q);
  assert.ok(!plan.referrers.some((r) => r.id === "rer-tricky"), "pattern must be end-anchored");
  await db.close();
});

test("formatPlan renders an empty plan without crashing", async () => {
  const text = formatPlan({ referrers: [], referrals: [] });
  assert.match(text, /Referrers matched \(0\)/);
  assert.match(text, /\(none\)/);
});
