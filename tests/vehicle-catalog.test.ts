import assert from "node:assert/strict";
import test from "node:test";
import carsData from "../cars.json" with { type: "json" };
import carMakesData from "../car-makes.json" with { type: "json" };
import { canonicalizeVehicle, canonicalMake, canonicalModel, CATALOG_YEAR_RANGE, isCatalogVehicleYear, isKnownMake } from "../app/lib/vehicle-catalog.ts";
import { OTHER_MAKE, VEHICLE_CATALOG_VERSION, VEHICLE_MAKES, VEHICLE_YEAR_RANGE, vehicleYearOptions } from "../app/lib/vehicle-makes.ts";
import { normalizeVehicleText } from "../app/lib/referral-rules.ts";

// The client ships car-makes.json and a hardcoded year range while the server
// reads the full cars.json. These guard that split: the two files come from one
// upstream export, so any drift between them (or between the range constant and
// the catalogue) is a bug, not a choice.
test("the client make list matches the full catalogue exactly", () => {
  const catalogueMakes = carsData.data.map((entry) => entry.make).sort();
  assert.deepEqual([...VEHICLE_MAKES].sort(), catalogueMakes);
});

test("both catalogue files come from the same upstream export", () => {
  assert.equal(VEHICLE_CATALOG_VERSION, carsData.version);
  assert.equal(carMakesData.version, carsData.version);
});

test("the client year range mirrors the catalogue's own yearRange", () => {
  assert.deepEqual([...VEHICLE_YEAR_RANGE], [...CATALOG_YEAR_RANGE]);
  assert.deepEqual([...VEHICLE_YEAR_RANGE], carsData.yearRange);
});

test("year options run newest-first across the whole catalogue range", () => {
  const years = vehicleYearOptions();
  assert.equal(years[0], VEHICLE_YEAR_RANGE[1]);
  assert.equal(years[years.length - 1], VEHICLE_YEAR_RANGE[0]);
  assert.equal(years.length, VEHICLE_YEAR_RANGE[1] - VEHICLE_YEAR_RANGE[0] + 1);
});

// The audit's actual R-04 ask: one source of truth with the main site, so
// grouping by make in HubSpot doesn't fragment.
test("makes resolve to catalogue spelling from any casing", () => {
  assert.equal(canonicalMake("ram"), "RAM");
  assert.equal(canonicalMake("RAM"), "RAM");
  assert.equal(canonicalMake("Ram"), "RAM");
  assert.equal(canonicalMake("mercedes-benz"), "Mercedes-Benz");
  assert.equal(canonicalMake("  toyota  "), "Toyota");
  assert.equal(canonicalMake("DeLorean"), null);
});

test("models resolve to catalogue spelling within their make", () => {
  assert.equal(canonicalModel("Toyota", "4runner"), "4Runner");
  assert.equal(canonicalModel("Honda", "cr-v"), "CR-V");
  assert.equal(canonicalModel("Toyota", "Mustang"), null);
});

test("canonicalizeVehicle prefers the catalogue and falls back to normalisation", () => {
  assert.deepEqual(canonicalizeVehicle("ram", "1500"), { make: "RAM", model: "1500" });
  assert.deepEqual(canonicalizeVehicle("TOYOTA", "4runner"), { make: "Toyota", model: "4Runner" });
  // Unlisted make: kept, not rejected — the catalogue is a snapshot and a
  // customer with an unlisted vehicle still needs a windshield.
  assert.deepEqual(canonicalizeVehicle("delorean", "dmc-12"), { make: "Delorean", model: "Dmc-12" });
});

// Every make the form can submit must survive canonicalisation byte-for-byte —
// this is the whole point of R-04. Checked against the catalogue itself rather
// than a fixture, so adding makes upstream extends the test automatically.
test("canonicalizeVehicle preserves every catalogue make exactly", () => {
  for (const entry of carsData.data) {
    assert.equal(canonicalizeVehicle(entry.make, "").make, entry.make);
    assert.equal(canonicalizeVehicle(entry.make.toLowerCase(), "").make, entry.make);
    assert.equal(canonicalizeVehicle(entry.make.toUpperCase(), "").make, entry.make);
  }
});

// The catalogue resolves listed makes, so the fallback map only runs on genuinely
// unlisted input — but it still must not mangle a spelling the catalogue uses.
test("the fallback casing map agrees with the catalogue on every make", () => {
  for (const entry of carsData.data) {
    assert.equal(
      normalizeVehicleText(entry.make),
      entry.make,
      `fallback normalisation changes catalogue make "${entry.make}"`,
    );
  }
});

// A model the form offers must likewise round-trip unchanged.
test("canonicalizeVehicle preserves every catalogue model exactly", () => {
  for (const entry of carsData.data) {
    for (const model of entry.models) {
      assert.equal(
        canonicalizeVehicle(entry.make, model.model).model,
        model.model,
        `${entry.make} ${model.model}`,
      );
    }
  }
});

test("isKnownMake accepts catalogue makes and the Other escape hatch", () => {
  assert.equal(isKnownMake("Toyota"), true);
  assert.equal(isKnownMake(OTHER_MAKE), true);
  assert.equal(isKnownMake("Definitely Not A Make"), false);
});

test("vehicle year is bounded by the catalogue range", () => {
  assert.equal(isCatalogVehicleYear(String(CATALOG_YEAR_RANGE[0])), true);
  assert.equal(isCatalogVehicleYear(String(CATALOG_YEAR_RANGE[1])), true);
  assert.equal(isCatalogVehicleYear(String(CATALOG_YEAR_RANGE[0] - 1)), false);
  assert.equal(isCatalogVehicleYear(String(CATALOG_YEAR_RANGE[1] + 1)), false);
  assert.equal(isCatalogVehicleYear("20a2"), false);
});
