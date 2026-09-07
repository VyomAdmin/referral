"use client";

import { usePathname } from "next/navigation";

// GA4 directly, not the shared GTM container.
//
// GTM-5HRL52B is the main site's container, and loading it here brought the
// whole main-site tag stack onto the referral subdomain: full page load went
// 885ms -> 3,391ms, requests 40 -> 84, and third-party hosts 0 -> 19 (Google
// Ads/DoubleClick, Facebook, Bing, and Microsoft Clarity among them). Two
// problems with that. The referral flow was the fastest page NuVision owns and
// became slower than the main quote page; and Clarity session-records a form
// that collects name, email, phone and insurance provider.
//
// Properly scoping those tags to www.nuvisionautoglass.com is a change inside
// the GTM container, which this codebase can't make. Loading GA4 directly gets
// the measurement that was actually wanted — pageviews plus the three referral
// events — with one third-party host instead of nineteen, and no session
// recording on a PII form. dataLayer is still populated, so re-pointing this at
// GTM later is a one-line change once the container's triggers are scoped.
const GA4_MEASUREMENT_ID = "G-SSJ8CWLWZ8";

const GA4_INIT_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_MEASUREMENT_ID}');`;

// Public referral funnel only — the admin dashboard is internal tooling and
// shouldn't be mixed into marketing/conversion analytics.
export function GoogleTagManager() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`} />
      <script id="ga4-init" dangerouslySetInnerHTML={{ __html: GA4_INIT_SCRIPT }} />
    </>
  );
}
