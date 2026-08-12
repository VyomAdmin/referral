import { InvalidTracker, StatusTimeline, TrackerHeader } from "../../../components/tracker";

export const metadata = { title: "Track your service" };

export default async function CustomerTrackerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== "demo") return <InvalidTracker />;

  return (
    <main className="tracker-page">
      <TrackerHeader label="Customer tracker" />
      <section className="customer-tracker page-width">
        <div className="customer-tracker-main">
          <span className="eyebrow">Service request NV-482190</span>
          <h1>We&apos;ve received your request.</h1>
          <p>A NuVision specialist will contact you to confirm the glass, insurance details, and appointment time.</p>
          <StatusTimeline activeIndex={0} customer />
        </div>
        <aside className="service-summary">
          <div className="summary-head"><span>AZ</span><div><small>Arizona referral</small><strong>Windshield replacement</strong></div></div>
          <dl>
            <div><dt>Vehicle</dt><dd>2022 Toyota Camry</dd></div>
            <div><dt>ZIP code</dt><dd>85001</dd></div>
            <div><dt>Submitted</dt><dd>Aug 11, 2026</dd></div>
            <div><dt>Referred by</dt><dd>Sandeep</dd></div>
          </dl>
          <div className="offer-card"><span>YOUR REFERRAL BENEFIT</span><strong>$50 additional cash back with insurance or $50 off a cash payment.</strong></div>
          <div className="support-note"><strong>Need help?</strong><span>Call NuVision at (855) 213-0100</span></div>
        </aside>
      </section>
    </main>
  );
}
