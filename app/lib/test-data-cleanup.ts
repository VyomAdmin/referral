// Removal of QA/E2E test data from the referral database.
//
// Scope is deliberately narrow: a row is "test data" only if an email address
// on it ends in @example.com. That domain is reserved by RFC 2606 and can
// never belong to a real person, which is what makes this safe to run against
// production without a human reviewing every row. Do NOT widen the pattern to
// match internal addresses (@nuvisionautoglass.com) — staff used real
// addresses for some production verification, and those rows are
// indistinguishable from genuine referrals by email alone.
//
// HubSpot is intentionally out of scope. Deleting a deal is irreversible and
// destroys sales history; the CRM side is handled separately by a human.
//
// Both PGlite (tests) and pg.Pool (production) expose query(sql, params) ->
// { rows }, so the same statements run against both.

export type SqlExecutor = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

// End-anchored: "a@example.com" matches, "a@example.com.attacker.test" does not.
export const TEST_EMAIL_PATTERN = "%@example.com";

// A pattern bug (or an unexpected production state) should stop the run rather
// than empty the tables. Tuned well above the ~10 known test rows and far
// below any plausible real dataset.
export const DEFAULT_MAX_DELETIONS = 200;

export type CleanupPlan = {
  referrers: { id: string; code: string; email: string; name: string }[];
  referrals: { id: string; customerEmail: string; status: string; reason: "test customer" | "test referrer" }[];
};

export type CleanupCounts = {
  emailEvents: number;
  smsEvents: number;
  trackerTokens: number;
  referralEvents: number;
  rewards: number;
  referrals: number;
  referrers: number;
  zipAttempts: number;
};

/**
 * Enumerate exactly what would be deleted. Reads only — safe to run anywhere.
 *
 * A referral is test data if its own customer email is a test address OR it
 * belongs to a test referrer. The second case matters: a test referrer's
 * referrals must go too, or deleting the referrer would orphan them (and the
 * foreign key would refuse the delete anyway).
 */
export async function planCleanup(query: SqlExecutor): Promise<CleanupPlan> {
  const referrers = await query(
    `select id, code, email, first_name, last_name
       from referrers
      where lower(email) like $1
      order by email`,
    [TEST_EMAIL_PATTERN],
  );

  const referrerIds = referrers.rows.map((row) => String(row.id));

  const referrals = await query(
    `select r.id, r.customer_email, r.public_status, r.referrer_id
       from referrals r
      where lower(r.customer_email) like $1
         or r.referrer_id = any($2::text[])
      order by r.created_at`,
    [TEST_EMAIL_PATTERN, referrerIds],
  );

  return {
    referrers: referrers.rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      email: String(row.email),
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    })),
    referrals: referrals.rows.map((row) => ({
      id: String(row.id),
      customerEmail: String(row.customer_email),
      status: String(row.public_status),
      reason: String(row.customer_email).toLowerCase().endsWith("@example.com") ? "test customer" : "test referrer",
    })),
  };
}

export class CleanupAbort extends Error {}

/**
 * Delete the planned rows inside a single transaction.
 *
 * Order follows the foreign keys: everything that references a referral or a
 * referrer goes first, then referrals (which reference referrers), then the
 * referrers themselves.
 *
 * audit_events are deliberately NOT deleted. They record which staff member
 * took which action, and an audit trail that can be erased by a cleanup script
 * is not an audit trail. They reference targets by plain text id, so no
 * foreign key forces the issue.
 */
export async function runCleanup(
  query: SqlExecutor,
  plan: CleanupPlan,
  options: { maxDeletions?: number } = {},
): Promise<CleanupCounts> {
  const max = options.maxDeletions ?? DEFAULT_MAX_DELETIONS;
  const scale = plan.referrers.length + plan.referrals.length;
  if (scale > max) {
    throw new CleanupAbort(
      `Refusing to delete: ${plan.referrers.length} referrers + ${plan.referrals.length} referrals exceeds the ${max}-row safety limit. ` +
        `Re-check the match pattern before raising the limit.`,
    );
  }

  const referrerIds = plan.referrers.map((r) => r.id);
  const referralIds = plan.referrals.map((r) => r.id);
  const codes = plan.referrers.map((r) => r.code);

  if (referrerIds.length === 0 && referralIds.length === 0) {
    return { emailEvents: 0, smsEvents: 0, trackerTokens: 0, referralEvents: 0, rewards: 0, referrals: 0, referrers: 0, zipAttempts: 0 };
  }

  const counts: CleanupCounts = {
    emailEvents: 0, smsEvents: 0, trackerTokens: 0, referralEvents: 0,
    rewards: 0, referrals: 0, referrers: 0, zipAttempts: 0,
  };

  // Deleted rows are returned so the caller reports real counts, not estimates.
  const deleted = async (sql: string, params: unknown[]) => (await query(sql, params)).rows.length;

  await query("begin");
  try {
    counts.emailEvents = await deleted(
      `delete from email_events where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds],
    );
    counts.smsEvents = await deleted(
      `delete from sms_events where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds],
    );
    counts.trackerTokens = await deleted(
      `delete from tracker_tokens where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds],
    );
    counts.referralEvents = await deleted(
      `delete from referral_events where referral_id = any($1::text[]) returning id`,
      [referralIds],
    );
    counts.rewards = await deleted(
      `delete from rewards where referral_id = any($1::text[]) returning id`,
      [referralIds],
    );
    counts.referrals = await deleted(
      `delete from referrals where id = any($1::text[]) returning id`,
      [referralIds],
    );
    counts.referrers = await deleted(
      `delete from referrers where id = any($1::text[]) returning id`,
      [referrerIds],
    );
    // No foreign key here — matched by the test referrers' codes.
    counts.zipAttempts = await deleted(
      `delete from non_serviceable_zip_attempts where referrer_code = any($1::text[]) returning id`,
      [codes],
    );
    await query("commit");
  } catch (error) {
    await query("rollback");
    throw error;
  }

  return counts;
}

export function formatPlan(plan: CleanupPlan): string {
  const lines: string[] = [];
  lines.push(`Referrers matched (${plan.referrers.length}):`);
  if (plan.referrers.length === 0) lines.push("  (none)");
  for (const r of plan.referrers) lines.push(`  ${r.code.padEnd(14)} ${r.email.padEnd(34)} ${r.name}`);
  lines.push(`Referrals matched (${plan.referrals.length}):`);
  if (plan.referrals.length === 0) lines.push("  (none)");
  for (const r of plan.referrals) lines.push(`  ${r.id}  ${r.customerEmail.padEnd(34)} ${r.status.padEnd(10)} (${r.reason})`);
  return lines.join("\n");
}
