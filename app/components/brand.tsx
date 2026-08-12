import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="NuVision Referrals home">
      <span className="brand-mark" aria-hidden="true">N</span>
      <span className="brand-words">
        <strong>NuVision</strong>
        <small>AUTO GLASS</small>
      </span>
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <div className="page-width header-inner">
        <Brand />
        <nav aria-label="Referral navigation">
          <a href="#join">Get my link</a>
          <Link href="/r/NV-SANDEEP">I was referred</Link>
          <Link href="/demo">Demo tour</Link>
          <Link className="header-track-link" href="/track/referrer/demo">Track referrals</Link>
        </nav>
      </div>
    </header>
  );
}
