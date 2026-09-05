// Storage-agnostic core of the rate limiter. Kept out of rate-limit.ts because
// that file carries "use server" (every export there must be an async server
// action), and because this is the half worth unit-testing without a database.

export type RateLimitStore = {
  // Number of recorded attempts for the scope at or after `since`.
  countSince(scopeKey: string, since: Date): Promise<number>;
  record(scopeKey: string): Promise<void>;
};

// Returns true when the caller is within its allowance.
//
// The blocked path deliberately does NOT record an attempt. Recording rejected
// attempts made the sliding window self-renewing: anyone who tripped the limit
// (a retrying script, or just an impatient user) kept pushing their own window
// forward and could never wait it out. With rejections uncounted, the window
// always drains `windowMinutes` after the last *allowed* attempt.
export async function evaluateRateLimit(
  store: RateLimitStore,
  scopeKey: string,
  maxAttempts: number,
  windowMinutes: number,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const attempts = await store.countSince(scopeKey, since);

  if (attempts >= maxAttempts) {
    return false;
  }

  await store.record(scopeKey);
  return true;
}
