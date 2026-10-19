import type { PublicConfig } from "./api.ts";

export function Privacy({ config }: { config: PublicConfig }) {
  return (
    <section className="panel">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy policy</h1>
      <p className="placeholder">{config.privacyText}</p>
      <h2>Text messages</h2>
      <p className="disclosure">{config.smsConsentText}</p>
      <p>Company: {config.legalName}. Brand: {config.brandName}. Domain: {config.domain}.</p>
    </section>
  );
}

export function Terms({ config }: { config: PublicConfig }) {
  return (
    <section className="panel">
      <p className="eyebrow">Terms</p>
      <h1>Referral terms</h1>
      <p className="placeholder">{config.termsText}</p>
      <p>Customer benefit: {config.customerBenefit}.</p>
    </section>
  );
}
