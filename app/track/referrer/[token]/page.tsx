import Link from "next/link";
import { InvalidTracker, publicStages, StatusTimeline, TrackerHeader } from "../../../components/tracker";
import { ReferrerVerifyGate } from "../../../components/referrer-verify-gate";
import { verifyTrackerToken } from "../../../lib/tracker-tokens";
import { getReferrerTrackerData } from "../../../lib/tracker-data";
import { isReferrerAccessVerified } from "../../../lib/tracker-verification";

export const metadata = { title: "Track your referrals" };

export default async function ReferrerTrackerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const match = await verifyTrackerToken(token, "referrer");
  if (!match?.referrerId) return <InvalidTracker />;

  const verified = await isReferrerAccessVerified(token);
  if (!verified) {
    return (
      <main className="tracker-page">
        <TrackerHeader label="Referrer tracker" />
        <ReferrerVerifyGate token={token} />
      </main>
    );
  }

  const data = await getReferrerTrackerData(match.referrerId);
  if (!data) return <InvalidTracker />;

  const { referrer, referrals, totals } = data;
  const latest = referrals[0];
  const latestIndex = latest ? Math.max(publicStages.findIndex((stage) => stage.key === latest.status), 0) : 0;

  return (
    <main className="tracker-page">
      <TrackerHeader label="Referrer tracker" />
      <section className="tracker-hero page-width">
        <div>
          <span className="eyebrow">Welcome back, {referrer.firstName}</span>
          <h1>Your referrals are moving.</h1>
          <p>Share your link, follow each milestone, and see when rewards are ready.</p>
        </div>
        <div className="tracker-share-card">
          <small>YOUR REFERRAL LINK</small>
          <strong>refer.nuvisionautoglass.com/r/{referrer.code}</strong>
          <div><button type="button">Copy link</button><Link href={`/r/${referrer.code}`}>Preview</Link></div>
        </div>
      </section>

      <section className="tracker-content page-width">
        <div className="tracker-metrics">
          <article><span>Total referrals</span><strong>{totals.total}</strong><small>All time</small></article>
          <article><span>Installed</span><strong>{totals.installed}</strong><small>{totals.total ? `${Math.round((totals.installed / totals.total) * 100)}% conversion` : "No referrals yet"}</small></article>
          <article className="metric-highlight"><span>Rewards earned</span><strong>${(totals.rewardsEarnedCents / 100).toFixed(0)}</strong><small>Paid rewards only</small></article>
        </div>

        <div className="tracker-grid">
          <section className="tracker-list-card">
            <div className="card-heading"><div><span className="eyebrow">Referral activity</span><h2>People you referred</h2></div><span className="status-pill status-pill-soft">{totals.total} total</span></div>
            <div className="referral-list">
              {referrals.length === 0 ? <p>Share your link to see referrals appear here.</p> : referrals.map((referral) => (
                <article key={referral.id}>
                  <div className="avatar-circle">{referral.customerFirstName.slice(0, 1)}</div>
                  <div className="referral-person"><strong>{referral.customerFirstName} {referral.customerLastName.slice(0, 1)}.</strong><small>{referral.state} • {referral.zip}</small></div>
                  <span className={`referral-status referral-${referral.status}`}>{publicStages.find((stage) => stage.key === referral.status)?.label ?? referral.status}</span>
                </article>
              ))}
            </div>
          </section>
          <aside className="tracker-status-card">
            <span className="eyebrow">Latest activity</span>
            <h2>{latest ? `${latest.customerFirstName}'s progress` : "No activity yet"}</h2>
            <p>Only privacy-safe status details are shown.</p>
            <StatusTimeline activeIndex={latestIndex} />
          </aside>
        </div>
      </section>
    </main>
  );
}
