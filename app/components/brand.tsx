import Link from "next/link";

export const NUVISION_HOME_URL = "https://www.nuvisionautoglass.com/";

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

// Themed brand: shows the real wordmark on the site's default dark theme (matching
// the footer), falling back to the icon+text lockup when the visitor switches to
// light theme, since the wordmark is white-only and would disappear on a light surface.
export function HeaderBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand brand-header ${compact ? "brand-header-compact" : ""}`} href={NUVISION_HOME_URL} aria-label="NuVision Auto Glass home">
      <img className="brand-header-wordmark" src="/nuvision-wordmark.png" alt="NuVision Auto Glass" width={150} height={56} />
      <img className="brand-header-mark-light brand-mark" src="/brand-icon.png" alt="" width={42} height={42} />
      <span className="brand-header-words-light brand-words">
        <strong>NuVision</strong>
        <small>AUTO GLASS</small>
      </span>
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
          <Link href="/r/NV-NUVISION">I was referred</Link>
          <Link href="/demo">Demo tour</Link>
          <Link className="header-track-link" href="/track">Track referrals</Link>
        </nav>
      </div>
    </header>
  );
}
