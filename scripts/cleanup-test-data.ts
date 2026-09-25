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
import { CleanupAbort, EXAMPLE_COM, formatPlan, listAll, planCleanup, runCleanup, type MatchSpec, type SqlExecutor } from "../app/lib/test-data-cleanup.ts";

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

/**
 * CLEANUP_MATCH_TERMS, comma-separated, switches from the safe @example.com
 * match to free-text substring matching against names and emails. That mode can
 * hit real people, so execute must never be reached on it without a human
 * having read a dry-run first.
 */
function resolveSpec(): MatchSpec {
  const raw = (process.env.CLEANUP_MATCH_TERMS ?? "").trim();
  if (!raw) return EXAMPLE_COM;
  const terms = raw.split(",").map((t) => t.trim()).filter(Boolean);
  return terms.length > 0 ? { terms } : EXAMPLE_COM;
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
    if ((process.env.CLEANUP_INVENTORY ?? "").trim() === "1") {
      console.log(`${TAG} inventory BEFORE:`);
      console.log(await listAll(query));
    }
    const spec = resolveSpec();
    const plan = await planCleanup(query, spec);
    console.log(`${TAG} mode=${mode} match=${spec.terms ? `terms[${spec.terms.join("|")}]` : spec.emailSuffix}`);
    console.log(formatPlan(plan));

    if (plan.referrers.length === 0 && plan.referrals.length === 0) {
      console.log(`${TAG} Nothing to remove.`);
      return;
    }

    if (mode === "dry-run") {
      console.log(`${TAG} DRY RUN — nothing was deleted. Set CLEANUP_TEST_DATA=execute to apply.`);
      return;
    }

    // Free-text terms can match real people, so executing on them takes a
    // second, separate acknowledgement naming the exact terms. Getting here by
    // flipping one env var would be too easy for something irreversible.
    if (spec.terms) {
      const expected = spec.terms.join(",");
      const reviewed = (process.env.CLEANUP_TERMS_REVIEWED ?? "").trim();
      if (reviewed !== expected) {
        console.error(
          `${TAG} REFUSING to execute term matching without review. ` +
            `Set CLEANUP_TERMS_REVIEWED="${expected}" once a human has read the dry-run list above` +
            (plan.collateralReferrals.length > 0
              ? `, paying particular attention to the ${plan.collateralReferrals.length} collateral referral(s).`
              : "."),
        );
        return;
      }
    }

    // CLEANUP_REQUIRE_CLEAN turns "only delete if it looks safe" into a
    // machine-checked precondition instead of a judgement someone has to
    // remember to make. Unsafe means either: a referral being removed only
    // because its referrer matched (most likely to be real), or a referral far
    // enough along to carry a reward obligation.
    if ((process.env.CLEANUP_REQUIRE_CLEAN ?? "").trim() === "1") {
      const advanced = plan.referrals.filter((r) => r.status === "installed" || r.status === "paid");
      const problems: string[] = [];
      // Collateral is never waivable here. Approving the removal of a known
      // test record says nothing about a genuine referral that happens to sit
      // under the same referrer, and those are the rows with real customers.
      if (plan.collateralReferrals.length > 0) {
        problems.push(
          `${plan.collateralReferrals.length} referral(s) match nothing themselves and would be lost with their referrer: ` +
            plan.collateralReferrals.map((r) => `${r.id} (${r.customerEmail})`).join(", "),
        );
      }
      // installed/paid IS waivable, but only by naming it separately — used
      // when a specific advanced row has been confirmed as test data.
      if (advanced.length > 0 && (process.env.CLEANUP_ALLOW_ADVANCED ?? "").trim() !== "1") {
        problems.push(`${advanced.length} referral(s) are installed/paid: ${advanced.map((r) => r.id).join(", ")}`);
      } else if (advanced.length > 0) {
        console.log(`${TAG} Allowing ${advanced.length} installed/paid referral(s) per CLEANUP_ALLOW_ADVANCED.`);
      }
      if (problems.length > 0) {
        console.error(`${TAG} NOT CLEAN — refusing to delete. ${problems.join("; ")}.`);
        console.error(`${TAG} Nothing was deleted. Review the list above and decide explicitly.`);
        return;
      }
      console.log(`${TAG} Clean check passed: no collateral, nothing installed or paid.`);
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
