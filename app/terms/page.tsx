import Link from "next/link";
import { HeaderBrand, NUVISION_HOME_URL, PRIVACY_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from "../components/brand";
import { REFERRER_CONSENT_VERSION } from "../lib/consent";

export const metadata = {
  title: "Referral Program Terms",
  description: "Eligibility rules, reward conditions, and payment terms for the NuVision Auto Glass referral program.",
};

// Restores the eligibility disclaimer that the old Referral Factory campaign
// carried (cutover audit C-05). Its absence was a real exposure: the reward
// rules were enforced in code but written down nowhere a referrer had agreed
// to, which is a weak position in a payout dispute. The conditions here mirror
// exactly what app/lib/admin-rules.ts enforces — if one changes, change both.
const LAST_UPDATED = "6 September 2026";

export default function ReferralTermsPage() {
  return (
    <main className="referral-page">
      <header className="flow-header page-width">
        <HeaderBrand />
        <div className="flow-header-actions">
          <Link href="/track">Track referrals</Link>
        </div>
      </header>

      <article className="legal-page page-width">
        <span className="eyebrow">LEGAL</span>
        <h1>Referral Program Terms</h1>
        <p className="legal-meta">Last updated {LAST_UPDATED} · Version {REFERRER_CONSENT_VERSION}</p>

        <p className="legal-lede">
          These terms govern the NuVision Auto Glass Referral Program (the &ldquo;Program&rdquo;). By joining the Program,
          creating a referral link, or submitting a referral, you accept these terms. Please read the eligibility
          and reward conditions carefully &mdash; a referral only earns a reward when every condition in section 3 is met.
        </p>

        <h2>1. Who can take part</h2>
        <ul>
          <li>You must be 18 years or older and a legal resident of the United States.</li>
          <li>You must provide accurate contact details and keep them current. We pay rewards using the details on file.</li>
          <li>Current employees, contractors, agents and their immediate household members are not eligible to earn rewards.</li>
          <li>The Program is offered only for vehicle service performed in <strong>Arizona and Florida</strong>. Referrals for service outside these states do not earn a reward.</li>
          <li>Businesses, lead brokers, affiliates and commercial lead-generation of any kind are excluded. The Program is for personal, word-of-mouth referrals only.</li>
        </ul>

        <h2>2. Who counts as a referred customer</h2>
        <ul>
          <li>The person you refer must be a <strong>new</strong> NuVision customer &mdash; not an existing or former customer, and not someone already in our records as a lead, quote, or open job at the time of your referral.</li>
          <li>The referred customer must reach us <strong>through your referral link</strong>, or be recorded by us against your referral code before their service is booked. We cannot credit a referral we have no record of.</li>
          <li>You may not refer yourself, anyone in your household, or submit a referral on someone&rsquo;s behalf without their permission.</li>
          <li>You must have the referred person&rsquo;s permission to share their contact details with us.</li>
          <li>If two or more referrers claim the same customer, the earliest recorded referral wins.</li>
        </ul>

        <h2>3. When a reward is earned</h2>
        <p>
          A referral earns a reward only when <strong>all</strong> of the following are true. Until then, no reward is
          owed, regardless of the status shown in your tracker:
        </p>
        <ol className="legal-conditions">
          <li>The referred customer is eligible under section 2.</li>
          <li>The job has been <strong>won and closed</strong> in our system.</li>
          <li>The <strong>installation or repair has been completed</strong> and recorded as completed by NuVision.</li>
          <li>The referral has not been rejected, cancelled, duplicated, or reversed.</li>
          <li>The work has not subsequently been refunded, charged back, or voided.</li>
        </ol>
        <p>
          A quote, booking, scheduled appointment, or a job marked won but not yet installed does <strong>not</strong>{" "}
          earn a reward. Statuses shown in your tracker are progress indicators, not a promise of payment.
        </p>

        <h2>4. Reward amount and payment</h2>
        <ul>
          <li>The reward amount is the amount shown on the Program page for the referred customer&rsquo;s state at the time their referral is submitted. NuVision may change reward amounts at any time; changes apply to referrals submitted after the change.</li>
          <li>Rewards are issued after the conditions in section 3 are met, normally within 30 days of the completed installation.</li>
          <li>Rewards have no cash surrender value except as expressly offered, are not transferable, and cannot be exchanged, combined, or applied to an outstanding balance unless we agree in writing.</li>
          <li>You are responsible for any taxes arising from rewards you receive. Where required by law, NuVision may request a completed Form W-9 and may issue a Form 1099 where total rewards paid to you reach the applicable annual threshold. We may withhold payment until required tax information is provided.</li>
          <li>Unclaimed rewards, and rewards we cannot pay because your contact or payment details are out of date or invalid, expire 12 months after the qualifying installation.</li>
        </ul>

        <h2>5. Fraud, abuse and misuse</h2>
        <p>
          NuVision may withhold, reverse, or cancel any reward, and may suspend or remove you from the Program, where
          we reasonably determine that a referral is fraudulent, duplicated, self-referred, obtained without the
          referred person&rsquo;s consent, generated by automated means, submitted through paid advertising or bidding on
          NuVision brand terms, distributed by spam or unsolicited messaging, or otherwise in breach of these terms.
          Where a reward has already been paid on such a referral, we may recover it or offset it against future rewards.
        </p>
        <p>
          You may share your referral link personally &mdash; by message, email, or in conversation. You may not present
          yourself as NuVision, imply employment or agency, advertise on our behalf, or use our name or branding in
          paid placements without written permission.
        </p>

        <h2>6. Determination of eligibility</h2>
        <p>
          NuVision determines whether a referral qualifies, based on our own service, sales and installation records.
          Our records are the authoritative source for whether a job was won, completed, cancelled, or reversed.
          Decisions on eligibility and reward amounts are made at NuVision&rsquo;s sole and reasonable discretion and are
          final. If you believe a referral was assessed incorrectly, contact us within 60 days of the installation
          date and we will review it.
        </p>

        <h2>7. Changing or ending the Program</h2>
        <p>
          NuVision may modify, suspend, or discontinue the Program, or change these terms, at any time and without
          notice. Rewards already earned under section 3 before a change takes effect will be honoured. Continuing to
          use your referral link after a change means you accept the updated terms. If the Program ends, referrals
          submitted before the end date are assessed under the terms that applied when they were submitted.
        </p>

        <h2>8. Communications and your data</h2>
        <p>
          By joining, you agree to receive emails and text messages about your referrals and rewards. Message and data
          rates may apply and message frequency varies; reply STOP to opt out of texts or use the unsubscribe link in
          any email. Opting out of Program messages may prevent us from notifying you about a reward. We handle
          personal information as described in our <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.
          We record the date, time, and IP address at which you accepted these terms.
        </p>

        <h2>9. No warranty; limitation of liability</h2>
        <p>
          The Program is provided &ldquo;as is&rdquo;. NuVision is not liable for referral links or messages that fail to
          deliver, tracking that fails for reasons outside our control, or any indirect or consequential loss arising
          from the Program. Nothing in these terms limits liability that cannot be limited by law, and nothing here
          affects the separate warranty that applies to glass work we perform.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These terms are governed by the laws of the State of Arizona, without regard to its conflict-of-laws rules.
          The Program is void where prohibited or restricted by law.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about the Program or a specific referral: call <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE_DISPLAY}</a>{" "}
          or visit <a href={NUVISION_HOME_URL}>nuvisionautoglass.com</a>.
        </p>

        <p className="legal-footnote">
          These terms cover the referral program only. They do not replace the terms of service, warranty, or privacy
          policy that apply to glass repair and replacement work performed by NuVision Auto Glass.
        </p>
      </article>
    </main>
  );
}
