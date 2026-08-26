import { and, eq } from "drizzle-orm";
import { HeaderBrand } from "../../components/brand";
import { ReferralJourney } from "../../components/referral-journey";
import { getDb } from "../../../db/index.ts";
import { referrers } from "../../../db/schema.ts";
import { getDefaultOrganizationId } from "../../lib/organization.ts";

export const metadata = {
  title: "You’ve been referred",
  description: "Start your NuVision windshield service with a referral.",
};

async function getReferrerFirstName(code: string) {
  try {
    const organizationId = await getDefaultOrganizationId();
    const db = getDb();
    const [referrer] = await db
      .select({ firstName: referrers.firstName })
      .from(referrers)
      .where(and(eq(referrers.organizationId, organizationId), eq(referrers.code, code)))
      .limit(1);
    return referrer?.firstName ?? null;
  } catch {
    return null;
  }
}

export default async function ReferredPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrerFirstName = await getReferrerFirstName(code);
  return (
    <main className="referral-page">
      <header className="flow-header page-width">
        <HeaderBrand />
        <span className="secure-note">Secure referral • {code}</span>
      </header>
      <ReferralJourney code={code} referrerFirstName={referrerFirstName} />
    </main>
  );
}
