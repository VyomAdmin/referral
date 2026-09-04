import Link from "next/link";

export const NUVISION_HOME_URL = "https://www.nuvisionautoglass.com/";

// The generic "I was referred" entry point (nav, homepage, demo links) — a
// code-less way into the referral flow, intentionally never a real referrer
// row. Referral-code validation on /r/[code] must treat it as always valid.
export const GENERIC_REFERRAL_CODE = "NV-NUVISION";

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
