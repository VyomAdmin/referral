// One-off removal of @example.com QA/E2E data from the referral database.
//
// The production database is only reachable from inside the VPC, so this is
// designed to run from the App Runner container at boot (see scripts/start.sh)
// as well as by hand from anywhere with DATABASE_URL set.
//
//   CLEANUP_TEST_DATA unset | "off"  -> does nothing at all
//   CLEANUP_TEST_DATA = "dry-run"    -> prints what it WOULD delete
//   CLEANUP_TEST_DATA = "execute"    -> deletes, inside one transaction
//
// Manual use:
//   node --experimental-strip-types scripts/cleanup-test-data.ts --dry-run
//   node --experimental-strip-types scripts/cleanup-test-data.ts --execute
//
// This script ALWAYS exits 0. It runs before `npm start` in the boot path, and
// a failed cleanup must never stop the service from coming up — failures are
// loud in the log instead. Nothing here is required for the app to work.

import { Pool } from "pg";
import { CleanupAbort, formatPlan, planCleanup, runCleanup, type SqlExecutor } from "../app/lib/test-data-cleanup.ts";

const TAG = "[cleanup-test-data]";

function resolveMode(): "off" | "dry-run" | "execute" {
  const args = process.argv.slice(2);
  if (args.includes("--execute")) return "execute";
  if (args.includes("--dry-run")) return "dry-run";
  const env = (process.env.CLEANUP_TEST_DATA ?? "").trim().toLowerCase();
  if (env === "execute") return "execute";
  if (env === "dry-run") return "dry-run";
  return "off";
}

async function main() {
  const mode = resolveMode();
  if (mode === "off") {
    console.log(`${TAG} CLEANUP_TEST_DATA is not set — skipping.`);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(`${TAG} DATABASE_URL is not set — skipping.`);
    return;
  }

  const pool = new Pool({ connectionString });
  const query: SqlExecutor = async (sql, params) => {
    const result = await pool.query(sql, params as unknown[]);
    return { rows: result.rows as Record<string, unknown>[] };
  };

  try {
    const plan = await planCleanup(query);
    console.log(`${TAG} mode=${mode}`);
    console.log(formatPlan(plan));

    if (plan.referrers.length === 0 && plan.referrals.length === 0) {
      console.log(`${TAG} Nothing to remove.`);
      return;
    }

    if (mode === "dry-run") {
      console.log(`${TAG} DRY RUN — nothing was deleted. Set CLEANUP_TEST_DATA=execute to apply.`);
      return;
    }

    const counts = await runCleanup(query, plan);
    console.log(`${TAG} Deleted:`, JSON.stringify(counts));
    console.log(`${TAG} Done. HubSpot was NOT touched — the CRM side is handled separately.`);
  } catch (error) {
    if (error instanceof CleanupAbort) {
      console.error(`${TAG} ABORTED: ${error.message}`);
    } else {
      console.error(`${TAG} FAILED (rolled back):`, error);
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

// Never propagate a non-zero exit: this runs ahead of `npm start`.
main().catch((error) => console.error(`${TAG} unexpected failure:`, error));
