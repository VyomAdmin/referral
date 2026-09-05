import carsData from "../../cars.json" with { type: "json" };
import { normalizeVehicleText } from "./referral-rules.ts";
import { OTHER_MAKE, VEHICLE_YEAR_RANGE } from "./vehicle-makes.ts";

// Server-only view of the vehicle catalogue. This statically imports the full
// ~680KB cars.json, which is fine in the server bundle but must never reach the
// browser — client code imports vehicle-makes.ts instead, which ships only the
// make list and fetches the rest on demand. Do not import this module from a
// "use client" component.

type CarsFile = { yearRange: [number, number]; data: { make: string; models: { model: string; years: number[] }[] }[] };

const cars = carsData as CarsFile;

export const CATALOG_YEAR_RANGE: readonly [number, number] = cars.yearRange;

// Lowercased lookup → canonical spelling, so whatever casing arrives resolves to
// the one spelling the main site uses. This is the real fix for the audit's
// "RAM vs Ram" drift: the catalogue itself is the source of truth rather than a
// hand-kept exception list.
const canonicalMakes = new Map<string, string>();
const canonicalModels = new Map<string, Map<string, string>>();

for (const entry of cars.data) {
  canonicalMakes.set(entry.make.toLowerCase(), entry.make);
  const models = new Map<string, string>();
  for (const model of entry.models) models.set(model.model.toLowerCase(), model.model);
  canonicalModels.set(entry.make, models);
}

export function canonicalMake(value: string): string | null {
  return canonicalMakes.get(value.trim().toLowerCase()) ?? null;
}

export function canonicalModel(make: string, value: string): string | null {
  return canonicalModels.get(make)?.get(value.trim().toLowerCase()) ?? null;
}

export type CanonicalVehicle = { make: string; model: string };

// Resolves a submitted make/model pair to catalogue spelling where possible.
// Deliberately lenient: an unrecognised make or model is normalised (title-cased)
// and kept rather than rejected. The catalogue is a 2026-07 snapshot, and a
// customer with a vehicle it doesn't list still has a windshield to replace —
// losing that lead would be a worse failure than an imperfect make string.
export function canonicalizeVehicle(rawMake: string, rawModel: string): CanonicalVehicle {
  const make = canonicalMake(rawMake) ?? normalizeVehicleText(rawMake);
  const knownModel = canonicalMake(rawMake) ? canonicalModel(make, rawModel) : null;
  return { make, model: knownModel ?? normalizeVehicleText(rawModel) };
}

export function isKnownMake(value: string) {
  return value === OTHER_MAKE || canonicalMake(value) !== null;
}

// The form only offers years the catalogue covers, so the server accepts the
// same range instead of the looser 1950..next-year bound it used before there
// was a catalogue to check against.
export function isCatalogVehicleYear(year: string) {
  if (!/^\d{4}$/.test(year)) return false;
  const value = Number(year);
  return value >= VEHICLE_YEAR_RANGE[0] && value <= VEHICLE_YEAR_RANGE[1];
}
