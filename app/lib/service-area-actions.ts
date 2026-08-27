"use server";

import { getDb } from "../../db/index.ts";
import { nonServiceableZipAttempts } from "../../db/schema.ts";
import { getDefaultOrganizationId } from "./organization.ts";

// Fire-and-forget: a customer finding out their ZIP isn't serviceable is the
// core, expected outcome for this call — logging it for later analysis must
// never itself become a reason the page errors.
export async function recordNonServiceableZipAction(zip: string, referrerCode?: string) {
  if (!/^\d{5}$/.test(zip)) return;
  try {
    const organizationId = await getDefaultOrganizationId();
    await getDb().insert(nonServiceableZipAttempts).values({
      id: crypto.randomUUID(),
      organizationId,
      zip,
      referrerCode: referrerCode ?? null,
    });
  } catch (error) {
    console.error("[service-area] failed to record non-serviceable zip:", error);
  }
}
