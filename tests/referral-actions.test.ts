import assert from "node:assert/strict";
import test from "node:test";
import { submitCustomerReferralAction } from "../app/lib/referral-actions.ts";

const validInput = {
  referralCode: "NV-SJ-9012",
  zip: "85001",
  state: "AZ",
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
