#!/usr/bin/env node
// Cross-checks insuranceProviders.json against HubSpot's real insurance_provider_2
// picklist on the deals object, using the exact same case-insensitive
// value-or-label matching as app/lib/hubspot-client.ts's resolvePicklistValue.
// Anything reported "NO MATCH" would fall through to install_notes__c on a
// real sync instead of landing on the picklist property — this catches that
// before it happens on a live lead, and re-catches it whenever HubSpot's
// options list changes.
//
// Usage: HUBSPOT_PRIVATE_APP_TOKEN=pat-... node scripts/verify-hubspot-picklists.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

if (!token) {
  console.error("Set HUBSPOT_PRIVATE_APP_TOKEN in the environment before running this script.");
  process.exit(1);
}

const insuranceProviders = JSON.parse(readFileSync(join(__dirname, "..", "insuranceProviders.json"), "utf8")).data;

async function fetchPropertyDefinition(objectType, propertyName) {
  const response = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}/${propertyName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`GET ${objectType}/${propertyName} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function findMatch(options, rawValue) {
  const needle = rawValue.trim().toLowerCase();
  return options.find((option) => option.value.toLowerCase() === needle || option.label.toLowerCase() === needle);
}

async function main() {
  console.log("Fetching insurance_provider_2 definition from HubSpot...");
  const definition = await fetchPropertyDefinition("deals", "insurance_provider_2");

  if (definition.type !== "enumeration") {
    console.log(`insurance_provider_2 is type "${definition.type}", not a picklist — nothing to verify.`);
    return;
  }

  console.log(`HubSpot has ${definition.options.length} options for "${definition.label}". Checking ${insuranceProviders.length} local values...\n`);

  const unmatched = [];
  for (const provider of insuranceProviders) {
    const match = findMatch(definition.options, provider);
    if (match) {
      console.log(`  OK    ${provider}  ->  ${match.value}`);
    } else {
      console.log(`  MISS  ${provider}`);
      unmatched.push(provider);
    }
  }

  console.log("");
  if (unmatched.length === 0) {
    console.log(`All ${insuranceProviders.length} values in insuranceProviders.json match a HubSpot option.`);
  } else {
    console.log(`${unmatched.length} value(s) in insuranceProviders.json do NOT match any HubSpot option and would fall back to install_notes__c:`);
    unmatched.forEach((provider) => console.log(`  - ${provider}`));
    process.exitCode = 1;
  }

  const localSet = new Set(insuranceProviders.map((provider) => provider.trim().toLowerCase()));
  const hubspotOnly = definition.options.filter((option) => !localSet.has(option.value.toLowerCase()) && !localSet.has(option.label.toLowerCase()));
  if (hubspotOnly.length > 0) {
    console.log(`\n${hubspotOnly.length} HubSpot option(s) have no entry in insuranceProviders.json (customers can never pick these from the dropdown):`);
    hubspotOnly.forEach((option) => console.log(`  - ${option.label} (${option.value})`));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
