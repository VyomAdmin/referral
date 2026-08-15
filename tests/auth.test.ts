import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../app/lib/password.ts";
import { generateTotpSecret, verifyTotpCode } from "../app/lib/totp.ts";
import { generateSecureToken, hashSecureToken, secureTokenExpiry } from "../app/lib/secure-token.ts";
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

test("secure tokens hash deterministically and are unguessable across generations", () => {
  const tokenA = generateSecureToken();
  const tokenB = generateSecureToken();
  assert.notEqual(tokenA, tokenB);
  assert.equal(hashSecureToken(tokenA), hashSecureToken(tokenA));
  assert.notEqual(hashSecureToken(tokenA), hashSecureToken(tokenB));
});

test("secure token expiry is computed relative to the given timestamp", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  const expiry = secureTokenExpiry(90, from);
  assert.equal(expiry.toISOString(), "2026-04-01T00:00:00.000Z");
});
