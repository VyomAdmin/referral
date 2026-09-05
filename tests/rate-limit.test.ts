import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRateLimit, type RateLimitStore } from "../app/lib/rate-limit-core.ts";

// An in-memory stand-in for the verification_attempts table, so the limiter's
// decision logic is testable with no DATABASE_URL (the suite runs without one).
function fakeStore() {
  const rows: { scopeKey: string; at: Date }[] = [];
  let recordAt = new Date();
  const store: RateLimitStore = {
    async countSince(scopeKey, since) {
      return rows.filter((r) => r.scopeKey === scopeKey && r.at >= since).length;
    },
    async record(scopeKey) {
      rows.push({ scopeKey, at: recordAt });
    },
  };
  return {
    store,
    rows,
    at(now: Date) {
      recordAt = now;
      return now;
    },
  };
}

const MINUTE = 60 * 1000;

test("allows up to the limit, then blocks", async () => {
  const { store, at } = fakeStore();
  const t0 = new Date("2026-09-05T12:00:00Z");

  for (let i = 0; i < 5; i++) {
    at(t0);
    assert.equal(await evaluateRateLimit(store, "scope", 5, 10, t0), true, `attempt ${i + 1} should be allowed`);
  }

  at(t0);
  assert.equal(await evaluateRateLimit(store, "scope", 5, 10, t0), false);
});

// Regression for the self-renewing lockout found during the 2026-09-04 prod E2E:
// blocked attempts used to be written to the table, so every retry pushed the
// sliding window forward and the caller could never wait the lockout out.
test("blocked attempts are not recorded, so the window still drains", async () => {
  const { store, rows, at } = fakeStore();
  const t0 = new Date("2026-09-05T12:00:00Z");

  for (let i = 0; i < 5; i++) {
    at(t0);
    await evaluateRateLimit(store, "scope", 5, 10, t0);
  }
  assert.equal(rows.length, 5);

  // Someone retries every minute for the whole window while locked out.
  for (let m = 1; m <= 9; m++) {
    const now = at(new Date(t0.getTime() + m * MINUTE));
    assert.equal(await evaluateRateLimit(store, "scope", 5, 10, now), false);
  }
  assert.equal(rows.length, 5, "rejected attempts must not add rows");

  // 10 minutes after the last *allowed* attempt, the lockout is over — under the
  // old behavior the retries above would have kept it locked indefinitely.
  const cleared = at(new Date(t0.getTime() + 10 * MINUTE + 1));
  assert.equal(await evaluateRateLimit(store, "scope", 5, 10, cleared), true);
});

test("scopes are independent of one another", async () => {
  const { store, at } = fakeStore();
  const t0 = new Date("2026-09-05T12:00:00Z");

  for (let i = 0; i < 5; i++) {
    at(t0);
    await evaluateRateLimit(store, "a", 5, 10, t0);
  }

  at(t0);
  assert.equal(await evaluateRateLimit(store, "a", 5, 10, t0), false);
  at(t0);
  assert.equal(await evaluateRateLimit(store, "b", 5, 10, t0), true);
});
