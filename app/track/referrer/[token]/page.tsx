import Link from "next/link";
import { InvalidTracker, StatusTimeline, TrackerHeader } from "../../../components/tracker";
import { verifyTrackerToken } from "../../../lib/tracker-tokens";

export const metadata = { title: "Track your referrals" };

const referrals = [
  { name: "Priya M.", location: "Phoenix, AZ", date: "Aug 10", status: "Appointment scheduled", tone: "scheduled", active: 1 },
  { name: "Carlos R.", location: "Tempe, AZ", date: "Aug 6", status: "Installation completed", tone: "installed", active: 2 },
  { name: "Avery T.", location: "Scottsdale, AZ", date: "Jul 24", status: "Reward paid", tone: "paid", active: 3 },
];

export default async function ReferrerTrackerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const match = await verifyTrackerToken(token, "referrer");
  if (!match) return <InvalidTracker />;

  return (
    <main className="tracker-page">
      <TrackerHeader label="Referrer tracker" />
      <section className="tracker-hero page-width">
        <div>
          <span className="eyebrow">Welcome back, Sandeep</span>
          <h1>Your referrals are moving.</h1>
          <p>Share your link, follow each milestone, and see when rewards are ready.</p>
        </div>
        <div className="tracker-share-card">
          <small>YOUR REFERRAL LINK</small>
          <strong>refer.nuvisionautoglass.com/r/NV-SANDEEP</strong>
          <div><button type="button">Copy link</button><Link href="/r/NV-SANDEEP">Preview</Link></div>
        </div>
      </section>

      <section className="tracker-content page-width">
        <div className="tracker-metrics">
          <article><span>Total referrals</span><strong>3</strong><small>All time</small></article>
          <article><span>Installed</span><strong>2</strong><small>67% conversion</small></article>
          <article className="metric-highlight"><span>Rewards earned</span><strong>$100</strong><small>$50 ready to process</small></article>
        </div>

        <div className="tracker-grid">
          <section className="tracker-list-card">
            <div className="card-heading"><div><span className="eyebrow">Referral activity</span><h2>People you referred</h2></div><span className="status-pill status-pill-soft">3 total</span></div>
            <div className="referral-list">
              {referrals.map((referral) => (
                <article key={referral.name}>
                  <div className="avatar-circle">{referral.name.slice(0, 1)}</div>
                  <div className="referral-person"><strong>{referral.name}</strong><small>{referral.location} • {referral.date}</small></div>
                  <span className={`referral-status referral-${referral.tone}`}>{referral.status}</span>
                </article>
              ))}
            </div>
          </section>
          <aside className="tracker-status-card">
            <span className="eyebrow">Latest activity</span>
            <h2>Priya&apos;s progress</h2>
            <p>Only privacy-safe status details are shown.</p>
            <StatusTimeline activeIndex={1} />
          </aside>
        </div>
      </section>
    </main>
  );
}
