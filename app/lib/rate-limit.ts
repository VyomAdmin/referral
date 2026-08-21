"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { verificationAttempts } from "../../db/schema.ts";

// A generic per-scope rate limiter backed by the database, so it holds across
// container restarts and multiple App Runner instances — an in-memory map
// would not. Used to stop brute-forcing the 4-digit phone suffix on tracker
// verification, where the only other input (email) is often guessable.
export async function checkRateLimit(scopeKey: string, maxAttempts: number, windowMinutes: number): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(verificationAttempts)
    .where(and(eq(verificationAttempts.scopeKey, scopeKey), gte(verificationAttempts.attemptedAt, since)));

  await db.insert(verificationAttempts).values({ id: crypto.randomUUID(), scopeKey });

  return Number(row?.count ?? 0) < maxAttempts;
}
