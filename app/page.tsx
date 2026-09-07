import Link from "next/link";
import { BrandWordmark, GENERIC_REFERRAL_CODE, HeaderBrand, PROGRAM_TERMS_URL, PublicHeader } from "./components/brand";
import { ReferrerRegistration } from "./components/referrer-registration";

export const metadata = {
  title: "Refer & Earn | NuVision Auto Glass",
  description:
    "Share NuVision Auto Glass with friends and track every successful referral.",
};

const trustPoints = [
  { value: "$50", label: "for every completed installation" },
  { value: "4 steps", label: "from referral to reward" },
  { value: "24/7", label: "referral tracking" },
];

export default function Home() {
  return (
    <main className="public-page">
      <PublicHeader />

      <section className="hero page-width">
        <div className="hero-copy">
          <span className="eyebrow">Friends & family referral program</span>
          <h1>Good service is worth sharing.</h1>
          <p className="hero-lede">
            Give someone you know a clearer, safer drive. When their windshield
            installation is complete, you earn a reward.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#join">
              Get my referral link
            </a>
            <Link className="button button-secondary" href={`/r/${GENERIC_REFERRAL_CODE}`}>
              I was referred
            </Link>
          </div>
          <p className="microcopy">No app to install. Track everything online.</p>
        </div>

        <div className="hero-card" id="join">
          <div className="hero-card-head">
            <HeaderBrand compact />
            <span className="status-pill status-pill-soft">Takes 30 seconds</span>
          </div>
          <div>
            <span className="step-kicker">STEP 1 OF 1</span>
            <h2>Create your referral link</h2>
            <p>Tell us where to send your link and tracking access.</p>
          </div>
          {/* The two things the old Referral Factory page said and this site
              didn't: how the $50 actually reaches you, and the rule that decides
              whether you get it. The link rule is the single most common
              referral dispute — a friend calls the office directly, the job
              happens, and the referrer asks where their $50 is. It has to be in
              front of the person it applies to, not only in /terms. */}
          <div className="reward-detail">
            <p className="reward-detail-lead">
              Get <strong>$50 as an Amazon, Walmart, Target or Starbucks voucher</strong> — or straight to your bank.
            </p>
            <p className="reward-detail-note">Florida: voucher only.</p>
            <p className="reward-detail-rule">
              Your friend must book through your link. If they contact us directly, the reward doesn&apos;t apply.{" "}
              <Link href={PROGRAM_TERMS_URL}>Full terms</Link>
            </p>
          </div>
          <ReferrerRegistration />
        </div>
      </section>

      <section className="trust-strip">
        <div className="page-width trust-grid">
          {trustPoints.map((point) => (
            <div className="trust-item" key={point.value}>
              <strong>{point.value}</strong>
              <span>{point.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="how-it-works page-width section-block">
        <div className="section-heading">
          <span className="eyebrow">Simple by design</span>
          <h2>Share. Track. Get rewarded.</h2>
          <p>You share one link. We handle everything after that.</p>
        </div>
        <div className="steps-grid">
          {[
            ["01", "Get your link", "Register once and receive a permanent, personal referral link."],
            ["02", "Share with a friend", "Send it by text, WhatsApp, email, or anywhere your people are."],
            ["03", "Follow the progress", "See when their request is received, scheduled, and completed."],
            ["04", "Receive your reward", "After installation is confirmed, your reward is ready to process."],
          ].map(([number, title, description]) => (
            <article className="step-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="public-footer">
        <div className="page-width footer-inner">
          <BrandWordmark />
          <p>See clearly. Drive safely. Share confidently.</p>
          <div>
            <a href="https://www.nuvisionautoglass.com/terms-conditions/">Program terms</a>
            <a href="https://www.nuvisionautoglass.com/privacy-policy/">Privacy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
