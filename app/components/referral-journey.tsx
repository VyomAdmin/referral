"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { campaignForZip, isValidEmail, isValidPhone, StateCampaign } from "../lib/referral-rules";
import { submitCustomerReferralAction } from "../lib/referral-actions";
import { recordNonServiceableZipAction } from "../lib/service-area-actions";
import { INSURANCE_PROVIDERS, isServiceableZipPrefix } from "../lib/service-area";
import { pushGtmEvent } from "../lib/analytics";

type Lead = {
  name: string;
  email: string;
  phone: string;
  make: string;
  year: string;
  model: string;
  insurance: string;
};

const emptyLead: Lead = { name: "", email: "", phone: "", make: "", year: "", model: "", insurance: "" };

export function ReferralJourney({ code, referrerFirstName }: { code: string; referrerFirstName: string | null }) {
  const referrerName = referrerFirstName ?? "your friend";
  const referrerInitial = referrerFirstName ? referrerFirstName.slice(0, 2).toUpperCase() : "NV";
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");
  const [campaign, setCampaign] = useState<StateCampaign | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [lead, setLead] = useState(emptyLead);
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [trackPath, setTrackPath] = useState("/track/customer/demo");

  // Live feedback as the customer types, before they've entered all 5 digits
  // or clicked Continue — as soon as we have a 3-digit prefix, we already
  // know whether it's serviceable (serviceableZips.json is prefix-based).
  const zipPrefixKnown = zip.length >= 3;
  const zipPrefixServiceable = useMemo(() => (zipPrefixKnown ? isServiceableZipPrefix(zip) : true), [zip, zipPrefixKnown]);

  function findCampaign(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{5}$/.test(zip)) {
      setZipError("Enter a valid five-digit ZIP code.");
      return;
    }
    const match = campaignForZip(zip);
    setCampaign(match);
    setUnsupported(!match);
    setZipError("");
    pushGtmEvent("referral_zip_entered", { referral_code: code, zip, state: match?.state ?? null, serviceable: Boolean(match) });
    if (!match) recordNonServiceableZipAction(zip, code).catch(() => {});
  }

  async function submitLead(event: FormEvent) {
    event.preventDefault();
    const complete = Object.values(lead).every((value) => value.trim());
    if (!complete || !isValidEmail(lead.email) || !isValidPhone(lead.phone)) {
      setFormError("Complete every field, including a valid email and a 10-digit mobile number.");
      return;
    }
    if (!consent) {
      setFormError("Please agree to the program terms to continue.");
      return;
    }
    if (!campaign) return;
    const [firstName, ...rest] = lead.name.trim().split(/\s+/);
    const outcome = await submitCustomerReferralAction({
      referralCode: code,
      zip,
      firstName,
      lastName: rest.join(" ") || firstName,
      email: lead.email,
      phone: lead.phone,
      vehicleMake: lead.make,
      vehicleYear: lead.year,
      vehicleModel: lead.model,
      insuranceProvider: lead.insurance,
      consent,
    });
    if ("error" in outcome) {
      setFormError(outcome.error);
      return;
    }
    setTrackPath(outcome.trackPath);
    setSubmitted(true);
    setFormError("");
    pushGtmEvent("referral_quote_submitted", { referral_code: code, referral_id: outcome.referralId, state: campaign.state });
  }

  function update(field: keyof Lead, value: string) {
    setLead((current) => ({ ...current, [field]: value }));
  }

  if (submitted && campaign) {
    return (
      <section className="flow-complete page-width">
        <div className="success-mark success-mark-large" aria-hidden="true">✓</div>
        <span className="eyebrow">Referral received</span>
        <h1>You&apos;re in good hands, {lead.name.split(" ")[0]}.</h1>
        <p>NuVision has received your request for {campaign.stateName}. A service specialist will contact you shortly.</p>
        <div className="confirmation-card">
          <div><span>Referral</span><strong>{code}</strong></div>
          <div><span>Location</span><strong>{zip}, {campaign.state}</strong></div>
          <div><span>Status</span><strong>Request received</strong></div>
        </div>
        <Link className="button button-primary" href={trackPath}>Track my service</Link>
        <small>A confirmation and secure tracking email has been queued for {lead.email}.</small>
      </section>
    );
  }

  return (
    <section className="referral-flow page-width">
      <div className="flow-intro">
        <span className="eyebrow">A personal referral from {referrerName}</span>
        <h1>Let&apos;s get you back to seeing clearly.</h1>
        <p>Start with your ZIP code so we can show the correct local service and offer.</p>
        <div className="referrer-note"><span>{referrerInitial}</span><p><strong>{referrerName} referred you</strong><br />Your referral is already attached.</p></div>
      </div>

      <div className="flow-panel">
        {!campaign && !unsupported ? (
          <form className="zip-form" onSubmit={findCampaign} noValidate>
            <span className="step-kicker">STEP 1 OF 2</span>
            <h2>Where do you need service?</h2>
            <p>Enter your ZIP to see local availability and referral benefits.</p>
            <label>
              ZIP code
              <input value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" placeholder="85001" aria-describedby="zip-help" aria-invalid={zipPrefixKnown && !zipPrefixServiceable} />
            </label>
            {zipPrefixKnown && !zipPrefixServiceable ? (
              <p className="form-error" role="alert">Not serviceable — that ZIP is outside our current coverage area.</p>
            ) : (
              <small id="zip-help">Try 85001 for Arizona or 33101 for Florida.</small>
            )}
            {zipError ? <p className="form-error" role="alert">{zipError}</p> : null}
            <button className="button button-primary" type="submit">Continue</button>
          </form>
        ) : null}

        {unsupported ? (
          <div className="unsupported-state">
            <span className="state-icon">⌖</span>
            <h2>We&apos;re not in that area yet.</h2>
            <p>NuVision&apos;s referral program is currently available in Arizona and Florida.</p>
            <button className="button button-secondary" type="button" onClick={() => { setUnsupported(false); setZip(""); }}>Try another ZIP</button>
          </div>
        ) : null}

        {campaign ? (
          <form className="customer-form" onSubmit={submitLead} noValidate>
            <div className={`campaign-banner campaign-${campaign.accent}`}>
              <span>{campaign.state}</span>
              <div><small>{campaign.campaignName}</small><strong>{campaign.serviceMessage}</strong></div>
            </div>
            {campaign.customerOffer ? (
              <div className="offer-card"><span>YOUR REFERRAL BENEFIT</span><strong>{campaign.customerOffer}</strong></div>
            ) : (
              <div className="offer-card offer-card-neutral"><span>LOCAL SERVICE</span><strong>No additional customer offer is active in {campaign.stateName}.</strong></div>
            )}
            <div className="form-title-row">
              <div><span className="step-kicker">STEP 2 OF 2</span><h2>Tell us about your vehicle</h2></div>
              <button type="button" className="text-button" onClick={() => setCampaign(null)}>Change ZIP</button>
            </div>
            <div className="customer-form-grid">
              <label className="field-wide">Full name<input value={lead.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" /></label>
              <label>Email<input type="email" value={lead.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" /></label>
              <label>Mobile number<input type="tel" inputMode="tel" maxLength={20} value={lead.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" /></label>
              <label>Vehicle make<input value={lead.make} onChange={(event) => update("make", event.target.value)} placeholder="Toyota" /></label>
              <label>Year<input value={lead.year} onChange={(event) => update("year", event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2022" /></label>
              <label>Model<input value={lead.model} onChange={(event) => update("model", event.target.value)} placeholder="Camry" /></label>
              <label>Insurance provider<select value={lead.insurance} onChange={(event) => update("insurance", event.target.value)}><option value="">Select one</option>{INSURANCE_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
            </div>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /> <span>I agree to the program terms and consent to service communications.</span></label>
            <button className="button button-primary" type="submit">Request my quote</button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
