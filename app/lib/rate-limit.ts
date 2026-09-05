"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { verificationAttempts } from "../../db/schema.ts";
import { evaluateRateLimit, type RateLimitStore } from "./rate-limit-core.ts";

// Best-effort caller IP for rate-limit scoping on public, unauthenticated forms.
// App Runner's Envoy proxy sets x-forwarded-for. next/headers is imported
// dynamically and swallowed on failure: node --test loads this module outside
// any Next.js/vinext request context, where next/headers can't resolve or
// headers() throws — that must degrade to a shared bucket, not crash the caller.
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    return forwardedFor?.split(",")[0]?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// A generic per-scope rate limiter backed by the database, so it holds across
// container restarts and multiple App Runner instances — an in-memory map
// would not. Used to stop brute-forcing the 4-digit phone suffix on tracker
// verification, where the only other input (email) is often guessable.
//
// The decision logic (including why blocked attempts are not recorded) lives in
// rate-limit-core.ts; this is just the Postgres-backed store around it.
export async function checkRateLimit(scopeKey: string, maxAttempts: number, windowMinutes: number): Promise<boolean> {
  const db = getDb();
  const store: RateLimitStore = {
    async countSince(key, since) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(verificationAttempts)
        .where(and(eq(verificationAttempts.scopeKey, key), gte(verificationAttempts.attemptedAt, since)));
      return Number(row?.count ?? 0);
    },
    async record(key) {
      await db.insert(verificationAttempts).values({ id: crypto.randomUUID(), scopeKey: key });
    },
  };

  return evaluateRateLimit(store, scopeKey, maxAttempts, windowMinutes);
}
