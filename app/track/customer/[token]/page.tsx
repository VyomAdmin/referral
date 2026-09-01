import Link from "next/link";
import { InvalidTracker, publicStages, StatusTimeline, TrackerHeader } from "../../../components/tracker";
import { TrackerVerifyGate } from "../../../components/tracker-verify-gate";
import { verifyTrackerToken } from "../../../lib/tracker-tokens";
import { getCustomerTrackerData } from "../../../lib/tracker-data";
import { isCustomerAccessVerified } from "../../../lib/tracker-verification";

export const metadata = { title: "Track your service" };

export default async function CustomerTrackerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const match = await verifyTrackerToken(token, "customer");
  if (!match?.referralId) return <InvalidTracker />;

  const verified = await isCustomerAccessVerified(token);
  if (!verified) {
    return (
      <main className="tracker-page">
        <TrackerHeader label="Customer tracker" />
        <TrackerVerifyGate kind="customer" token={token} />
      </main>
    );
  }

  const referral = await getCustomerTrackerData(match.referralId);
  if (!referral) return <InvalidTracker />;

  const activeIndex = Math.max(publicStages.findIndex((stage) => stage.key === referral.status), 0);
  const vehicle = [referral.vehicleYear, referral.vehicleMake, referral.vehicleModel].filter(Boolean).join(" ") || "Vehicle on file";
  const submittedAt = new Date(referral.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="tracker-page">
      <TrackerHeader label="Customer tracker" />
      <section className="customer-tracker page-width">
        <div className="customer-tracker-main">
          <span className="eyebrow">Service request for {referral.customerFirstName}</span>
          <h1>We&apos;ve received your request.</h1>
          <p>A NuVision specialist will contact you to confirm the glass, insurance details, and appointment time.</p>
          <StatusTimeline activeIndex={activeIndex} customer />
        </div>
        <aside className="service-summary">
          <div className="summary-head"><span>{referral.state}</span><div><small>{referral.state} referral</small><strong>Windshield replacement</strong></div></div>
          <dl>
            <div><dt>Vehicle</dt><dd>{vehicle}</dd></div>
            <div><dt>ZIP code</dt><dd>{referral.zip}</dd></div>
            <div><dt>Submitted</dt><dd>{submittedAt}</dd></div>
            <div><dt>Referred by</dt><dd>{referral.referrerFirstName}</dd></div>
          </dl>
          {referral.customerOffer ? <div className="offer-card"><span>YOUR REFERRAL BENEFIT</span><strong>{referral.customerOffer}</strong></div> : null}
          <div className="support-note"><strong>Need help?</strong><span>Call NuVision at (855) 213-0100</span></div>
        </aside>
      </section>
      {referral.otherOrders.length > 0 ? (
        <section className="tracker-content page-width">
          <div className="tracker-list-card">
            <div className="card-heading"><div><span className="eyebrow">Same email and phone</span><h2>Your other requests</h2></div><span className="status-pill status-pill-soft">{referral.otherOrders.length} more</span></div>
            <div className="referral-list">
              {referral.otherOrders.map((order) => (
                <Link key={order.trackPath} href={order.trackPath} className="referral-list-link">
                  <article>
                    <div className="referral-person"><strong>{order.state} • {order.zip}</strong><small>Submitted {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div>
                    <span className={`referral-status referral-${order.status}`}>{publicStages.find((stage) => stage.key === order.status)?.label ?? order.status}</span>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
