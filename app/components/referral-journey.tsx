"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { campaignForZip, isValidEmail, isValidPhone, isValidVehicleYear, MIN_VEHICLE_YEAR, maxVehicleYear, StateCampaign } from "../lib/referral-rules";
import { submitCustomerReferralAction } from "../lib/referral-actions";
import { recordNonServiceableZipAction } from "../lib/service-area-actions";
import { INSURANCE_PROVIDERS, isServiceableZipPrefix } from "../lib/service-area";
import { pushGtmEvent } from "../lib/analytics";
import { PRIVACY_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF, TERMS_URL, TRUST_SIGNALS } from "./brand";

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

type FieldErrors = Partial<Record<keyof Lead | "consent", string>>;

// R-03: one message per field instead of a single banner covering the whole
// form, so the customer can see which input is actually wrong. The browser's
// own constraint validation (R-02) catches most of this first; this runs for
// the cases native validation can't express (10-digit phone, year bounds) and
// as the fallback if scripting or native validation is bypassed.
function validateLead(lead: Lead, consent: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!lead.name.trim()) errors.name = "Enter your full name.";
  if (!lead.email.trim()) errors.email = "Enter your email address.";
  else if (!isValidEmail(lead.email)) errors.email = "That email address doesn't look right.";
  if (!lead.phone.trim()) errors.phone = "Enter your mobile number.";
  else if (!isValidPhone(lead.phone)) errors.phone = "Enter a 10-digit US mobile number.";
  if (!lead.make.trim()) errors.make = "Enter your vehicle's make.";
  if (!lead.year.trim()) errors.year = "Enter your vehicle's year.";
  else if (!isValidVehicleYear(lead.year)) errors.year = `Enter a year between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear()}.`;
  if (!lead.model.trim()) errors.model = "Enter your vehicle's model.";
  if (!lead.insurance) errors.insurance = "Choose your insurance provider.";
  if (!consent) errors.consent = "Please agree to the program terms to continue.";
  return errors;
}

// US mobile display mask (R-03/medium item): formats as the customer types
// without fighting deletion — the digits are the source of truth and the
// separators are re-derived on every keystroke.
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
    const errors = validateLead(lead, consent);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Check the highlighted fields below.");
      return;
    }
    setFieldErrors({});
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
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
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
        {/* R-09: the old screen ended at "we'll contact you shortly", which
            leaves the customer guessing (and calling). Spell out the sequence,
            with the timeframe and the phone number, before the CTA. */}
        <ol className="next-steps">
          <li><strong>Within one business hour</strong><span>A NuVision specialist calls to confirm your glass and verify insurance coverage.</span></li>
          <li><strong>We book your slot</strong><span>Same-day or next-day mobile service, at your home or workplace.</span></li>
          <li><strong>We come to you</strong><span>Replacement plus any ADAS recalibration, backed by our lifetime warranty.</span></li>
        </ol>
        <Link className="button button-primary" href={trackPath}>Track my service</Link>
        <small>A confirmation and secure tracking email has been queued for {lead.email}. Need us sooner? Call <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE_DISPLAY}</a>.</small>
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
        <a className="call-now" href={SUPPORT_PHONE_HREF}>
          <span aria-hidden="true">☎</span>
          <span><small>Rather talk to someone?</small><strong>Call {SUPPORT_PHONE_DISPLAY}</strong></span>
        </a>
        <ul className="trust-signals">
          {TRUST_SIGNALS.map((signal) => (
            <li key={signal.title}><strong>{signal.title}</strong><span>{signal.detail}</span></li>
          ))}
        </ul>
      </div>

      <div className="flow-panel">
        {!campaign && !unsupported ? (
          <form className="zip-form" onSubmit={findCampaign}>
            <span className="step-kicker">STEP 1 OF 2</span>
            <h2>Where do you need service?</h2>
            <p>Enter your ZIP to see local availability and referral benefits.</p>
            <label htmlFor="referral-zip">
              ZIP code
              <input id="referral-zip" name="zip" value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" required pattern="\d{5}" minLength={5} maxLength={5} aria-describedby="zip-help" aria-invalid={(zipPrefixKnown && !zipPrefixServiceable) || Boolean(zipError)} />
            </label>
            {zipPrefixKnown && !zipPrefixServiceable ? (
              <p className="form-error" role="alert">Not serviceable — that ZIP is outside our current coverage area.</p>
            ) : (
              <small id="zip-help">Where the vehicle is — we service Arizona and Florida.</small>
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
          <form className="customer-form" onSubmit={submitLead}>
            <div className={`campaign-banner campaign-${campaign.accent}`}>
              <span>{campaign.state}</span>
              <div><small>{campaign.campaignName}</small><strong>{campaign.serviceMessage}</strong></div>
            </div>
            {/* Only shown when there IS an offer. A card that exists purely to
                say no offer is active reads as an exclusion and depresses
                conversion (Florida converts well below Arizona), so the whole
                block is hidden rather than filled with a negative. */}
            {campaign.customerOffer ? (
              <div className="offer-card"><span>YOUR REFERRAL BENEFIT</span><strong>{campaign.customerOffer}</strong></div>
            ) : null}
            <div className="form-title-row">
              <div><span className="step-kicker">STEP 2 OF 2</span><h2>Tell us about your vehicle</h2></div>
              <button type="button" className="text-button" onClick={() => setCampaign(null)}>Change ZIP</button>
            </div>
            <div className="customer-form-grid">
              <div className="field field-wide">
                <label htmlFor="lead-name">Full name</label>
                <input id="lead-name" name="name" value={lead.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "lead-name-error" : undefined} />
                {fieldErrors.name ? <p className="field-error" id="lead-name-error" role="alert">{fieldErrors.name}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-email">Email</label>
                <input id="lead-email" name="email" type="email" value={lead.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "lead-email-error" : undefined} />
                {fieldErrors.email ? <p className="field-error" id="lead-email-error" role="alert">{fieldErrors.email}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-phone">Mobile number</label>
                <input id="lead-phone" name="phone" type="tel" inputMode="tel" value={formatPhone(lead.phone)} onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0, 10))} autoComplete="tel" placeholder="(602) 555-0134" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "lead-phone-error" : undefined} />
                {fieldErrors.phone ? <p className="field-error" id="lead-phone-error" role="alert">{fieldErrors.phone}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-make">Vehicle make</label>
                <input id="lead-make" name="vehicleMake" value={lead.make} onChange={(event) => update("make", event.target.value)} placeholder="Toyota" required aria-invalid={Boolean(fieldErrors.make)} aria-describedby={fieldErrors.make ? "lead-make-error" : undefined} />
                {fieldErrors.make ? <p className="field-error" id="lead-make-error" role="alert">{fieldErrors.make}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-year">Year</label>
                <input id="lead-year" name="vehicleYear" value={lead.year} onChange={(event) => update("year", event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2022" required pattern="\d{4}" minLength={4} maxLength={4} aria-invalid={Boolean(fieldErrors.year)} aria-describedby={fieldErrors.year ? "lead-year-error" : undefined} />
                {fieldErrors.year ? <p className="field-error" id="lead-year-error" role="alert">{fieldErrors.year}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-model">Model</label>
                <input id="lead-model" name="vehicleModel" value={lead.model} onChange={(event) => update("model", event.target.value)} placeholder="Camry" required aria-invalid={Boolean(fieldErrors.model)} aria-describedby={fieldErrors.model ? "lead-model-error" : undefined} />
                {fieldErrors.model ? <p className="field-error" id="lead-model-error" role="alert">{fieldErrors.model}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="lead-insurance">Insurance provider</label>
                <select id="lead-insurance" name="insuranceProvider" value={lead.insurance} onChange={(event) => update("insurance", event.target.value)} required aria-invalid={Boolean(fieldErrors.insurance)} aria-describedby={fieldErrors.insurance ? "lead-insurance-error" : undefined}>
                  <option value="">Select one</option>
                  {INSURANCE_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
                {fieldErrors.insurance ? <p className="field-error" id="lead-insurance-error" role="alert">{fieldErrors.insurance}</p> : null}
              </div>
            </div>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="field">
              <label className="consent-row" htmlFor="lead-consent">
                <input id="lead-consent" name="consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setFieldErrors((current) => { const next = { ...current }; delete next.consent; return next; }); }} required aria-invalid={Boolean(fieldErrors.consent)} />
                <span>
                  I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Program Terms</a> and <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>, and consent to service calls, texts and emails about this request. Message and data rates may apply; message frequency varies. Reply STOP to opt out.
                </span>
              </label>
              {fieldErrors.consent ? <p className="field-error" role="alert">{fieldErrors.consent}</p> : null}
            </div>
            <button className="button button-primary" type="submit">Request my quote</button>
            <p className="form-assist">Prefer to talk it through? Call <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE_DISPLAY}</a> — we&apos;ll attach your referral for you.</p>
          </form>
        ) : null}
      </div>
    </section>
  );
}
