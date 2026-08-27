import assert from "node:assert/strict";
import test from "node:test";
import { INSURANCE_PROVIDERS, isServiceableZipPrefix } from "../app/lib/service-area.ts";

test("isServiceableZipPrefix accepts a 3-digit prefix present in serviceableZips.json", () => {
  assert.equal(isServiceableZipPrefix("850"), true);
  assert.equal(isServiceableZipPrefix("85001"), true);
});

test("isServiceableZipPrefix rejects a prefix that's in-range but not in serviceableZips.json", () => {
  // 858 falls inside the old 850-865 numeric range but isn't a listed prefix.
  assert.equal(isServiceableZipPrefix("858"), false);
  assert.equal(isServiceableZipPrefix("85800"), false);
});

test("isServiceableZipPrefix rejects fewer than 3 digits and non-numeric input", () => {
  assert.equal(isServiceableZipPrefix("85"), false);
  assert.equal(isServiceableZipPrefix(""), false);
  assert.equal(isServiceableZipPrefix("abc"), false);
});

test("INSURANCE_PROVIDERS is a non-empty, deduplicated list", () => {
  assert.ok(INSURANCE_PROVIDERS.length > 50);
  assert.equal(new Set(INSURANCE_PROVIDERS).size, INSURANCE_PROVIDERS.length);
});
