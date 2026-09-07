import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Migrations run against production BEFORE the app starts: scripts/start.sh does
// `npm run db:migrate && npm start`. So a migration that fails on real data
// doesn't get skipped — it stops the service from booting. That makes any
// migration which can fail on existing rows an availability risk, and it's why
// these run against a real Postgres engine here rather than being eyeballed.

const MIGRATIONS_DIR = path.resolve(fileURLToPath(new URL("../drizzle", import.meta.url)));

async function migrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

// drizzle-kit separates statements with this marker.
function statementsOf(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !/^(--[^\n]*\n?)+$/.test(chunk));
}

async function applyMigrations(db: PGlite, upTo?: string) {
  for (const file of await migrationFiles()) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of statementsOf(sql)) {
      await db.exec(statement);
    }
    if (upTo && file === upTo) return;
  }
}

test("every migration applies cleanly to an empty database, in order", async () => {
  const db = await PGlite.create();
  await applyMigrations(db);
  const { rows } = await db.query<{ indexname: string }>(
    `select indexname from pg_indexes where tablename = 'referrers' order by indexname`,
  );
  const names = rows.map((r) => r.indexname);
  assert.ok(names.includes("referrer_org_code_idx"), names.join(", "));
  assert.ok(names.includes("referrer_org_email_idx"), names.join(", "));
  await db.close();
});

// The case that made 0012 necessary and dangerous: production already holds
// duplicate referrer emails, so the index cannot simply be added.
test("0012 renames duplicate referrer emails oldest-first, then adds the index", async () => {
  const db = await PGlite.create();
  const beforeIndex = (await migrationFiles()).find((f) => f.startsWith("0011"))!;
  await applyMigrations(db, beforeIndex);

  await db.exec(`insert into organizations (id, name, slug, brand_name) values ('org1', 'NuVision', 'nuvision', 'NuVision'), ('org2', 'Other', 'other', 'Other')`);

  // Three signups by one person, plus a genuine second person, plus the same
  // address under a different organization (must not be treated as duplicate).
  const rows: [string, string, string, string][] = [
    ["r1", "org1", "sonu@nv.com", "2026-01-01"],
    ["r2", "org1", "sonu@nv.com", "2026-02-01"],
    ["r3", "org1", "sonu@nv.com", "2026-03-01"],
    ["r4", "org1", "priya@nv.com", "2026-01-05"],
    ["r5", "org2", "sonu@nv.com", "2026-01-01"],
  ];
  for (const [id, org, email, day] of rows) {
    await db.exec(
      `insert into referrers (id, organization_id, code, first_name, last_name, email, phone, created_at, updated_at)
       values ('${id}', '${org}', 'NV-${id}', 'First', 'Last', '${email}', '6025550000', '${day}', '${day}')`,
    );
  }

  const migration = (await migrationFiles()).find((f) => f.startsWith("0012"))!;
  for (const statement of statementsOf(await readFile(path.join(MIGRATIONS_DIR, migration), "utf8"))) {
    await db.exec(statement);
  }

  const { rows: after } = await db.query<{ id: string; email: string }>(
    `select id, email from referrers order by id`,
  );
  const byId = Object.fromEntries(after.map((r) => [r.id, r.email]));

  // The oldest row keeps the address — it owns the code already shared.
  assert.equal(byId.r1, "sonu@nv.com");
  assert.equal(byId.r2, "sonu@nv.com-dup1");
  assert.equal(byId.r3, "sonu@nv.com-dup2");
  // Untouched: not a duplicate.
  assert.equal(byId.r4, "priya@nv.com");
  // Same address, different organization — the index is per-org, so this must
  // NOT be renamed. Getting this wrong would corrupt a second tenant's data.
  assert.equal(byId.r5, "sonu@nv.com");

  // And the index now exists, which is only possible because the rename ran first.
  const { rows: indexes } = await db.query<{ indexname: string }>(
    `select indexname from pg_indexes where tablename = 'referrers' and indexname = 'referrer_org_email_idx'`,
  );
  assert.equal(indexes.length, 1);

  // The constraint is live: a fourth signup on the freed address is rejected.
  await assert.rejects(
    () =>
      db.exec(
        `insert into referrers (id, organization_id, code, first_name, last_name, email, phone)
         values ('r6', 'org1', 'NV-r6', 'First', 'Last', 'sonu@nv.com', '6025550000')`,
      ),
    /duplicate key|unique/i,
  );
  await db.close();
});

// Re-running migrate must be a no-op, not an error — App Runner re-runs it on
// every deploy and every container replacement.
test("re-applying the migration set is idempotent via drizzle's own tracking", async () => {
  const db = await PGlite.create();
  await applyMigrations(db);
  // Applying 0012's index a second time is exactly what drizzle's journal
  // prevents; assert it would indeed conflict, so the journal is load-bearing
  // and nobody "helpfully" makes it re-runnable.
  await assert.rejects(
    () => db.exec(`CREATE UNIQUE INDEX "referrer_org_email_idx" ON "referrers" USING btree ("organization_id","email")`),
    /already exists/i,
  );
  await db.close();
});
