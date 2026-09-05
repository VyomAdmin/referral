import Link from "next/link";

export const NUVISION_HOME_URL = "https://www.nuvisionautoglass.com/";

// The generic "I was referred" entry point (nav, homepage, demo links) — a
// code-less way into the referral flow, intentionally never a real referrer
// row. Referral-code validation on /r/[code] must treat it as always valid.
export const GENERIC_REFERRAL_CODE = "NV-NUVISION";

// The number the main site leads with ("Call NOW"). Kept here so the referral
// site can't drift from it, and so the referee flow has the same call-now
// escape hatch the main site's quote form offers.
export const SUPPORT_PHONE_DISPLAY = "1855-213-0100";
export const SUPPORT_PHONE_HREF = "tel:+18552130100";

// Consent copy has to link to the actual policies for the consent to be
// provable (cutover audit C-01); these live on the main site, not here.
export const TERMS_URL = `${NUVISION_HOME_URL}terms-conditions/`;
export const PRIVACY_URL = `${NUVISION_HOME_URL}privacy-policy/`;

// Verified service claims carried over from the main site, shown alongside the
// referee form as trust signals (cutover audit R-07). Only claims the main site
// already makes publicly — nothing invented for this page.
export const TRUST_SIGNALS: readonly { title: string; detail: string }[] = [
  { title: "$0 with insurance", detail: "Most comprehensive policies cover the full replacement." },
  { title: "Same-day mobile service", detail: "We come to your home or workplace, seven days a week." },
  { title: "Lifetime warranty", detail: "Covered for as long as you own the vehicle." },
  { title: "OEM glass & ADAS calibration", detail: "Camera and sensor recalibration done with the fit." },
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home">
      <img className="brand-mark" src="/brand-icon.png" alt="" width={42} height={42} />
      <span className="brand-words">
        <strong>NuVision</strong>
        <small>AUTO GLASS</small>
      </span>
    </a>
  );
}

// Full wordmark for dark surfaces (e.g. the public footer) where there's room
// for NuVision's actual logo lockup instead of the compact icon+text brand.
export function BrandWordmark() {
  return (
    <a className="brand-wordmark" href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home">
      <img src="/nuvision-wordmark.png" alt="NuVision Auto Glass" width={150} height={56} />
    </a>
  );
}

// Themed brand: shows NuVision's real wordmark on any surface — the white
// version on the site's default dark theme (matching the footer), the full-color
// version when the visitor switches to light theme, since the white wordmark
// would disappear there.
export function HeaderBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand brand-header ${compact ? "brand-header-compact" : ""}`} href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home">
      <img className="brand-header-wordmark" src="/nuvision-wordmark.png" alt="NuVision Auto Glass" width={150} height={56} />
      <img className="brand-header-wordmark-light" src="/nuvision-wordmark-color.png" alt="NuVision Auto Glass" width={150} height={39} />
    </a>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <div className="page-width header-inner">
        <HeaderBrand />
        <nav aria-label="Referral navigation">
          <a href="#join">Get my link</a>
          <Link href={`/r/${GENERIC_REFERRAL_CODE}`}>I was referred</Link>
          <Link className="header-track-link" href="/track">Track referrals</Link>
        </nav>
      </div>
    </header>
  );
}
