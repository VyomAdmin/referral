import carMakesData from "../../car-makes.json" with { type: "json" };

// Client-safe half of the vehicle catalogue. car-makes.json is ~2KB so it ships
// in the bundle; cars.json (the full make→model→years tree) is ~680KB and is
// fetched on demand from /cars.json instead — see loadVehicleModels below.
// Both files come from the main site's multiStepForm, so the referral site and
// the main quote form offer exactly the same vehicles.

export const VEHICLE_CATALOG_VERSION = carMakesData.version;

export const VEHICLE_MAKES: readonly string[] = carMakesData.makes.map((entry) => entry.make);

// Mirrors cars.json's own `yearRange`. Duplicated here rather than imported so
// the client bundle stays small; tests/vehicle-catalog.test.ts asserts the two
// stay in step, so this can't silently drift from the catalogue.
export const VEHICLE_YEAR_RANGE: readonly [number, number] = [1995, 2027];

// Escape hatch for a vehicle the catalogue doesn't list. The main site's form
// offers the same option, and picking it swaps the model dropdown for free text.
export const OTHER_MAKE = "Other";

export function vehicleYearOptions(): number[] {
  const [min, max] = VEHICLE_YEAR_RANGE;
  const years: number[] = [];
  for (let year = max; year >= min; year--) years.push(year);
  return years;
}

type CarsFile = { data: { make: string; models: { model: string; years: number[] }[] }[] };

let modelsByMake: Map<string, string[]> | undefined;
let inFlight: Promise<Map<string, string[]>> | undefined;

// Fetches and caches the full catalogue once per page. Callers must handle a
// rejection by falling back to a free-text model field — a CDN hiccup must
// never cost a lead.
export async function loadVehicleModels(): Promise<Map<string, string[]>> {
  if (modelsByMake) return modelsByMake;
  inFlight ??= fetch("/cars.json")
    .then((response) => {
      if (!response.ok) throw new Error(`cars.json ${response.status}`);
      return response.json() as Promise<CarsFile>;
    })
    .then((file) => {
      const map = new Map<string, string[]>();
      for (const entry of file.data) {
        map.set(
          entry.make,
          entry.models.map((model) => model.model).sort((a, b) => a.localeCompare(b)),
        );
      }
      modelsByMake = map;
      return map;
    })
    .catch((error) => {
      inFlight = undefined;
      throw error;
    });
  return inFlight;
}
