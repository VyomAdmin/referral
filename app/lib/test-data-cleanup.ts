// Removal of QA/test data from the referral database.
//
// TWO MATCHING MODES, WITH VERY DIFFERENT SAFETY PROPERTIES.
//
// 1. EXAMPLE_COM (the default). Matches addresses ending @example.com. That
//    domain is reserved by RFC 2606 and can never belong to a real person,
//    which is what makes it safe to run unattended.
//
// 2. Free-text `terms`. Matches a case-insensitive substring against names and
//    email addresses. This is NOT safe to run unattended: real people have
//    names that collide with QA words ("Testa" contains "test"; a real staff
//    member may share a first name with a test account). ALWAYS dry-run and
//    have a human read the list before executing with terms.
//
// The cascade is the thing to watch. Deleting a referrer necessarily deletes
// that referrer's referrals — the foreign key allows nothing else. So a single
// wrongly-matched referrer can take genuine customer referrals and reward
// obligations down with it. planCleanup reports those rows separately as
// `collateralReferrals` precisely so they can't pass unnoticed.
//
// HubSpot is intentionally out of scope. Deleting a deal is irreversible and
// destroys sales history; the CRM side is handled separately by a human.
//
// Both PGlite (tests) and pg.Pool (production) expose query(sql, params) ->
// { rows }, so the same statements run against both.

export type SqlExecutor = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export type MatchSpec = {
  /** End-anchored email match, e.g. "@example.com". */
  emailSuffix?: string;
  /** Case-insensitive substrings matched against names and emails. Risky. */
  terms?: string[];
};

export const EXAMPLE_COM: MatchSpec = { emailSuffix: "@example.com" };

// A pattern bug (or an unexpected production state) should stop the run rather
// than empty the tables.
export const DEFAULT_MAX_DELETIONS = 200;

export type MatchedReferrer = {
  id: string; code: string; email: string; name: string;
  /** Which field(s) caused the match — shown so a human can sanity-check it. */
  matchedOn: string[];
};

export type MatchedReferral = {
  id: string; customerEmail: string; customerName: string; status: string;
  /** "direct" = the referral's own fields matched. "cascade" = only its referrer matched. */
  reason: "direct" | "cascade";
};

export type CleanupPlan = {
  referrers: MatchedReferrer[];
  referrals: MatchedReferral[];
  /**
   * Referrals being deleted ONLY because their referrer matched — nothing
   * about the referral itself looks like test data. These are the rows most
   * likely to be real. Review them before executing.
   */
  collateralReferrals: MatchedReferral[];
};

export type CleanupCounts = {
  emailEvents: number; smsEvents: number; trackerTokens: number;
  referralEvents: number; rewards: number; referrals: number;
  referrers: number; zipAttempts: number;
};

/** % and _ are LIKE wildcards; a term containing them must match literally. */
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/**
 * Build an OR of LIKE clauses over the given columns. Column names are
 * hardcoded by callers, never user input; the values are parameterised.
 */
function matchSql(columns: string[], spec: MatchSpec, params: unknown[]): string {
  const clauses: string[] = [];
  for (const column of columns) {
    if (spec.emailSuffix && column.includes("email")) {
      params.push(`%${escapeLike(spec.emailSuffix.toLowerCase())}`);
      clauses.push(`lower(${column}) like $${params.length}`);
    }
    for (const term of spec.terms ?? []) {
      if (!term.trim()) continue;
      params.push(`%${escapeLike(term.trim().toLowerCase())}%`);
      clauses.push(`lower(${column}) like $${params.length}`);
    }
  }
  return clauses.length > 0 ? `(${clauses.join(" or ")})` : "false";
}

/** Which of a row's fields actually matched — for the human-readable report. */
function whyMatched(row: Record<string, unknown>, fields: [string, string][], spec: MatchSpec): string[] {
  const hits: string[] = [];
  for (const [label, key] of fields) {
    const value = String(row[key] ?? "").toLowerCase();
    if (!value) continue;
    if (spec.emailSuffix && key.includes("email") && value.endsWith(spec.emailSuffix.toLowerCase())) {
      hits.push(`${label}~"${spec.emailSuffix}"`);
    }
    for (const term of spec.terms ?? []) {
      const needle = term.trim().toLowerCase();
      if (needle && value.includes(needle)) hits.push(`${label}~"${term.trim()}"`);
    }
  }
  return hits;
}

export class CleanupAbort extends Error {}

/**
 * Every remaining referrer and referral, with creation dates. Read-only.
 *
 * Exists because the production database is only reachable from inside the
 * VPC, so there is otherwise no way to see what a proposed match term would
 * be chosen from. Used to identify rows by eye before committing to a pattern.
 */
export async function listAll(query: SqlExecutor): Promise<string> {
  const referrers = await query(
    `select code, email, first_name, last_name, created_at
       from referrers order by created_at`, []);
  const referrals = await query(
    `select id, customer_email, customer_first_name, customer_last_name,
            public_status, created_at
       from referrals order by created_at`, []);

  // Both pg and PGlite hand back Date objects for timestamptz, and
  // String(date) renders "Fri Sep 25 ..." — useless for identifying a row by
  // date. Normalise to ISO yyyy-mm-dd.
  const day = (value: unknown) => {
    if (!value) return "----------";
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
  };
  const lines: string[] = [];

  lines.push(`ALL referrers (${referrers.rows.length}):`);
  for (const r of referrers.rows) {
    const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
    lines.push(`  ${day(r.created_at)}  ${String(r.code).padEnd(14)} ${String(r.email).padEnd(38)} ${name}`);
  }
  lines.push(`ALL referrals (${referrals.rows.length}):`);
  for (const r of referrals.rows) {
    const name = `${r.customer_first_name ?? ""} ${r.customer_last_name ?? ""}`.trim();
    lines.push(`  ${day(r.created_at)}  ${r.id}  ${String(r.customer_email).padEnd(38)} ${name.padEnd(24)} ${r.public_status}`);
  }
  return lines.join("\n");
}

/** Enumerate exactly what would be deleted. Reads only — safe to run anywhere. */
export async function planCleanup(query: SqlExecutor, spec: MatchSpec = EXAMPLE_COM): Promise<CleanupPlan> {
  const referrerParams: unknown[] = [];
  const referrerWhere = matchSql(["email", "first_name", "last_name"], spec, referrerParams);
  const referrerRows = await query(
    `select id, code, email, first_name, last_name
       from referrers
      where ${referrerWhere}
      order by email`,
    referrerParams,
  );

  const referrers: MatchedReferrer[] = referrerRows.rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    email: String(row.email),
    name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    matchedOn: whyMatched(row, [["email", "email"], ["first", "first_name"], ["last", "last_name"]], spec),
  }));
  const referrerIds = referrers.map((r) => r.id);

  const referralParams: unknown[] = [];
  const referralWhere = matchSql(
    ["customer_email", "customer_first_name", "customer_last_name"],
    spec,
    referralParams,
  );
  referralParams.push(referrerIds);
  const referralRows = await query(
    `select id, customer_email, customer_first_name, customer_last_name, public_status, referrer_id
       from referrals
      where ${referralWhere} or referrer_id = any($${referralParams.length}::text[])
      order by created_at`,
    referralParams,
  );

  const referrals: MatchedReferral[] = referralRows.rows.map((row) => {
    const hits = whyMatched(
      row,
      [["email", "customer_email"], ["first", "customer_first_name"], ["last", "customer_last_name"]],
      spec,
    );
    return {
      id: String(row.id),
      customerEmail: String(row.customer_email),
      customerName: `${row.customer_first_name ?? ""} ${row.customer_last_name ?? ""}`.trim(),
      status: String(row.public_status),
      reason: hits.length > 0 ? "direct" : "cascade",
    };
  });

  return { referrers, referrals, collateralReferrals: referrals.filter((r) => r.reason === "cascade") };
}

/**
 * Delete the planned rows inside a single transaction.
 *
 * Order follows the foreign keys: everything referencing a referral or a
 * referrer goes first, then referrals (which reference referrers), then the
 * referrers.
 *
 * audit_events are deliberately NOT deleted. They record which staff member
 * took which action, and an audit trail a cleanup script can erase is not an
 * audit trail. They reference targets by plain text id, so no foreign key
 * forces the issue.
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

  const counts: CleanupCounts = {
    emailEvents: 0, smsEvents: 0, trackerTokens: 0, referralEvents: 0,
    rewards: 0, referrals: 0, referrers: 0, zipAttempts: 0,
  };
  if (referrerIds.length === 0 && referralIds.length === 0) return counts;

  const deleted = async (sql: string, params: unknown[]) => (await query(sql, params)).rows.length;

  await query("begin");
  try {
    counts.emailEvents = await deleted(
      `delete from email_events where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds]);
    counts.smsEvents = await deleted(
      `delete from sms_events where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds]);
    counts.trackerTokens = await deleted(
      `delete from tracker_tokens where referral_id = any($1::text[]) or referrer_id = any($2::text[]) returning id`,
      [referralIds, referrerIds]);
    counts.referralEvents = await deleted(
      `delete from referral_events where referral_id = any($1::text[]) returning id`, [referralIds]);
    counts.rewards = await deleted(
      `delete from rewards where referral_id = any($1::text[]) returning id`, [referralIds]);
    counts.referrals = await deleted(
      `delete from referrals where id = any($1::text[]) returning id`, [referralIds]);
    counts.referrers = await deleted(
      `delete from referrers where id = any($1::text[]) returning id`, [referrerIds]);
    counts.zipAttempts = await deleted(
      `delete from non_serviceable_zip_attempts where referrer_code = any($1::text[]) returning id`, [codes]);
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
  for (const r of plan.referrers) {
    lines.push(`  ${r.code.padEnd(14)} ${r.email.padEnd(36)} ${r.name.padEnd(22)} [${r.matchedOn.join(" ")}]`);
  }
  lines.push(`Referrals matched (${plan.referrals.length}):`);
  if (plan.referrals.length === 0) lines.push("  (none)");
  for (const r of plan.referrals) {
    lines.push(`  ${r.id}  ${r.customerEmail.padEnd(36)} ${r.customerName.padEnd(22)} ${r.status.padEnd(10)} ${r.reason}`);
  }
  if (plan.collateralReferrals.length > 0) {
    lines.push("");
    lines.push(`!! ${plan.collateralReferrals.length} referral(s) match NOTHING themselves and are being removed only`);
    lines.push("!! because their referrer matched. These are the most likely to be real data:");
    for (const r of plan.collateralReferrals) {
      lines.push(`   ${r.id}  ${r.customerEmail.padEnd(36)} ${r.customerName.padEnd(22)} ${r.status}`);
    }
  }
  return lines.join("\n");
}
