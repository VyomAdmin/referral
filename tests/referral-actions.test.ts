import assert from "node:assert/strict";
import test from "node:test";
import { submitCustomerReferralAction } from "../app/lib/referral-actions.ts";

const validInput = {
  referralCode: "NV-SJ-9012",
  zip: "85001",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "5551234567",
  vehicleMake: "Toyota",
  vehicleYear: "2022",
  vehicleModel: "Camry",
  insuranceProvider: "GEICO",
};

test("customer referral is rejected server-side without consent, before touching the database", async () => {
  const outcome = await submitCustomerReferralAction({ ...validInput, consent: false });
  assert.deepEqual(outcome, { error: "Please agree to the program terms to continue." });
});

// B-02: the state is derived from the ZIP server-side (never trusted from the
// client), so these are checked ahead of the DB lookups/consent — no DATABASE_URL
// is needed for either case to fail fast with the right message.
test("customer referral is rejected when the ZIP isn't exactly 5 digits", async () => {
  const outcome = await submitCustomerReferralAction({ ...validInput, zip: "850011", consent: true });
  assert.deepEqual(outcome, { error: "Enter a valid five-digit ZIP code." });
});

test("customer referral is rejected when the ZIP falls outside AZ/FL coverage", async () => {
  const outcome = await submitCustomerReferralAction({ ...validInput, zip: "10001", consent: true });
  assert.deepEqual(outcome, { error: "We don't yet support service in this area." });
});
