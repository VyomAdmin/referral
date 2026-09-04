import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { HeaderBrand, NUVISION_HOME_URL } from "../../components/brand";
import { ReferralJourney } from "../../components/referral-journey";
import { getDb } from "../../../db/index.ts";
import { referrers } from "../../../db/schema.ts";
import { getDefaultOrganizationId } from "../../lib/organization.ts";

export const metadata = {
  title: "You’ve been referred",
  description: "Start your NuVision windshield service with a referral.",
};

type ReferrerLookup = { status: "valid"; firstName: string } | { status: "invalid" } | { status: "unknown" };

// Distinguishes a confirmed-bad code (no matching row — real invalid-code case,
// e.g. a typo or a fabricated code) from a lookup that couldn't be verified (DB
// unreachable). Only the confirmed case should block the form: a transient DB
// hiccup must never turn away a legitimate referral, so it falls back to
// "unknown" and the form still renders (with the generic "your friend" copy),
// same as before this distinction existed.
async function lookupReferrer(code: string): Promise<ReferrerLookup> {
  try {
    const organizationId = await getDefaultOrganizationId();
    const db = getDb();
    const [referrer] = await db
      .select({ firstName: referrers.firstName })
      .from(referrers)
      .where(and(eq(referrers.organizationId, organizationId), eq(referrers.code, code)))
      .limit(1);
    return referrer ? { status: "valid", firstName: referrer.firstName } : { status: "invalid" };
  } catch {
    return { status: "unknown" };
  }
}

export default async function ReferredPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lookup = await lookupReferrer(code);

  if (lookup.status === "invalid") {
    return (
      <main className="referral-page">
        <header className="flow-header page-width">
          <HeaderBrand />
          <div className="flow-header-actions">
            <Link href="/track">Already submitted? Track it</Link>
          </div>
        </header>
        <section className="invalid-tracker page-width">
          <span className="state-icon">!</span>
          <h1>This referral link isn&apos;t valid.</h1>
          <p>The code &quot;{code}&quot; doesn&apos;t match an active NuVision referrer. Double-check the link a friend sent you, or get a quote directly — no referral needed.</p>
          <a className="button button-primary" href={NUVISION_HOME_URL}>Get a quote</a>
        </section>
      </main>
    );
  }

  const referrerFirstName = lookup.status === "valid" ? lookup.firstName : null;
  return (
    <main className="referral-page">
      <header className="flow-header page-width">
        <HeaderBrand />
        <div className="flow-header-actions">
          <Link href="/track">Already submitted? Track it</Link>
          <span className="secure-note">Secure referral • {code}</span>
        </div>
      </header>
      <ReferralJourney code={code} referrerFirstName={referrerFirstName} />
    </main>
  );
}
