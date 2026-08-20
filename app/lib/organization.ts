"use server";

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { organizations } from "../../db/schema.ts";

const DEFAULT_ORGANIZATION_SLUG = process.env.DEFAULT_ORGANIZATION_SLUG ?? "nuvision";
const REFERRAL_DOMAIN = "referrals.nuvisionautoglass.com";

// The public referrer/customer flows have no signed-in session, so there is no
// organizationId to read from auth. NuVision is the only tenant today (see
// AGENT_HANDOFF.md), so this bootstraps that single row on first use instead of
// requiring a manual seed step ahead of true multi-tenant domain routing.
export async function getDefaultOrganizationId() {
  const db = getDb();
  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORGANIZATION_SLUG)).limit(1);
  if (existing) {
    if (existing.referralDomain !== REFERRAL_DOMAIN) {
      await db.update(organizations).set({ referralDomain: REFERRAL_DOMAIN }).where(eq(organizations.id, existing.id));
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(organizations).values({
    id,
    slug: DEFAULT_ORGANIZATION_SLUG,
    name: "NuVision Auto Glass",
    brandName: "NuVision",
    referralDomain: REFERRAL_DOMAIN,
  });
  return id;
}
