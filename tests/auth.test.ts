import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../app/lib/password.ts";
import { generateTotpSecret, verifyTotpCode } from "../app/lib/totp.ts";
import { generateTrackerToken, hashTrackerToken, trackerTokenExpiry } from "../app/lib/tracker-tokens.ts";
import { generate } from "otplib";

test("password hash/verify round trip", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("TOTP verifies a code generated from the same secret", async () => {
  const secret = generateTotpSecret();
  const code = await generate({ secret });
  assert.equal(await verifyTotpCode(secret, code), true);
  assert.equal(await verifyTotpCode(secret, "000000"), false);
});

test("TOTP rejects malformed codes without checking the secret", async () => {
  const secret = generateTotpSecret();
  assert.equal(await verifyTotpCode(secret, "abcdef"), false);
  assert.equal(await verifyTotpCode(secret, "123"), false);
});

test("tracker tokens hash deterministically and are unguessable across generations", () => {
  const tokenA = generateTrackerToken();
  const tokenB = generateTrackerToken();
  assert.notEqual(tokenA, tokenB);
  assert.equal(hashTrackerToken(tokenA), hashTrackerToken(tokenA));
  assert.notEqual(hashTrackerToken(tokenA), hashTrackerToken(tokenB));
});

test("tracker token expiry is computed relative to the given timestamp", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  const expiry = trackerTokenExpiry(90, from);
  assert.equal(expiry.toISOString(), "2026-04-01T00:00:00.000Z");
});
