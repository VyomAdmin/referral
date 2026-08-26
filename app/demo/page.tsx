import Link from "next/link";
import { PublicHeader, Brand } from "../components/brand";

export const metadata = {
  title: "Demo Tour | NuVision Referrals",
  description: "A guided, clickable walkthrough of every NuVision referral platform surface.",
};

const flowSteps = [
  {
    href: "/",
    title: "1. Referrer registration",
    description: "Sign up with name, email, and phone to generate a permanent referral link.",
    hint: "Start here",
  },
  {
    href: "/r/NV-NUVISION",
    title: "2. Referred-customer journey",
    description: "Open a shared link, enter a ZIP, and see state-specific offer copy and the quote form.",
    hint: "Try ZIP 85001 (AZ, $50 offer) or 33101 (FL, no offer)",
  },
  {
    href: "/track/referrer/demo",
    title: "3. Referrer tracker",
    description: "Privacy-safe view of every referral's progress and reward status for the referrer.",
    hint: "Passwordless secure link",
  },
  {
    href: "/track/customer/demo",
    title: "4. Customer tracker",
    description: "The referred customer's own view of their service progress and applicable offer.",
    hint: "Stops at installation completed",
  },
  {
    href: "/track/customer/expired",
    title: "5. Expired secure link",
    description: "How a tracker link behaves once it has expired — the fallback state.",
    hint: "Failure-state example",
  },
  {
    href: "/admin",
    title: "6. Internal operations portal",
    description: "Overview metrics, global search, timelines, campaigns, rewards, and integration status.",
    hint: "Not yet production-authenticated",
  },
];

const siteMap = [
  {
    group: "Public referral journey",
    items: [
      { href: "/", label: "Referrer registration" },
      { href: "/r/NV-NUVISION", label: "Referred-customer ZIP gate + quote" },
    ],
  },
  {
    group: "Tracking",
    items: [
      { href: "/track/referrer/demo", label: "Referrer tracker (demo token)" },
      { href: "/track/customer/demo", label: "Customer tracker (demo token)" },
      { href: "/track/customer/expired", label: "Expired tracker state" },
    ],
  },
  {
    group: "Internal operations",
    items: [{ href: "/admin", label: "Admin portal (overview, search, campaigns, rewards, analytics, team, integrations)" }],
  },
  {
    group: "Integration boundary",
    items: [{ href: null, label: "POST /api/webhooks/hubspot — signed HubSpot webhook ingestion", method: "POST" }],
  },
];

export default function DemoPage() {
  return (
    <main className="public-page demo-page">
      <PublicHeader />

      <section className="hero-copy page-width section-block" style={{ paddingBottom: 0 }}>
        <span className="eyebrow">Live product demo</span>
        <h1>Walk the full referral journey.</h1>
        <p className="hero-lede">
          Click through in order to see exactly what a referrer, a referred customer, and an
          internal operator each experience. Every card below opens a real, working page.
        </p>
      </section>

      <section className="page-width section-block" style={{ paddingTop: 40 }}>
        <div className="section-heading">
          <span className="eyebrow">Guided flow</span>
          <h2>Six steps, start to finish</h2>
        </div>
        <div className="flow-grid">
          {flowSteps.map((step) => (
            <Link key={step.href} href={step.href} className="flow-card">
              <span className="flow-number">{step.title.split(".")[0]}</span>
              <h3>{step.title.replace(/^\d+\.\s*/, "")}</h3>
              <p>{step.description}</p>
              <span className="flow-hint">{step.hint}</span>
              <span className="flow-open">Open this step &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="page-width section-block" style={{ paddingTop: 0 }}>
        <div className="section-heading">
          <span className="eyebrow">Reference</span>
          <h2>Full site map</h2>
          <p>Every product surface currently implemented, grouped by area.</p>
        </div>
        <div className="sitemap-grid">
          {siteMap.map((group) => (
            <div className="sitemap-group" key={group.group}>
              <h3>{group.group}</h3>
              <ul className="sitemap-list">
                {group.items.map((item) => (
                  <li key={item.label}>
                    {item.href ? (
                      <Link href={item.href}>
                        {item.label}
                        <code>{item.href}</code>
                      </Link>
                    ) : (
                      <span className="sitemap-static">
                        {item.label}
                        <code>{item.method}</code>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="public-footer">
        <div className="page-width footer-inner">
          <Brand compact />
          <p>See clearly. Drive safely. Share confidently.</p>
          <div>
            <Link href="/">Referrer registration</Link>
            <Link href="/admin">Team access</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
