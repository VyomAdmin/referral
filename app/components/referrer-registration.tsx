"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { isValidPhone } from "../lib/referral-rules";
import { submitReferrerRegistrationAction } from "../lib/referrer-actions";
import { pushGtmEvent } from "../lib/analytics";
import { PRIVACY_URL, TERMS_URL } from "./brand";

type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type FieldErrors = Partial<Record<keyof Registration, string>>;

const emptyRegistration: Registration = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

export function ReferrerRegistration() {
  const [form, setForm] = useState(emptyRegistration);
  const [result, setResult] = useState<{ code: string; firstName: string } | null>(null);
  const [trackPath, setTrackPath] = useState("/track/referrer/demo");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const link = useMemo(
    () => (result ? `${typeof window === "undefined" ? "https://referrals.nuvisionautoglass.com" : window.location.origin}/r/${result.code}` : ""),
    [result],
  );

  function update(field: keyof Registration, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!form.firstName.trim()) errors.firstName = "Enter your first name.";
    if (!form.lastName.trim()) errors.lastName = "Enter your last name.";
    if (!form.email.trim()) errors.email = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "That email address doesn't look right.";
    if (!form.phone.trim()) errors.phone = "Enter your mobile number.";
    else if (!isValidPhone(form.phone)) errors.phone = "Enter a 10-digit US mobile number.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Check the highlighted fields below.");
      return;
    }
    setFieldErrors({});
    const outcome = await submitReferrerRegistrationAction(form);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setTrackPath(outcome.trackPath);
    setResult({ code: outcome.code, firstName: outcome.firstName });
    setError("");
    pushGtmEvent("referral_link_created", { referral_code: outcome.code });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (result) {
    const shareText = encodeURIComponent("NuVision took great care of my windshield. Use my referral link to get started:");
    return (
      <div className="link-result" aria-live="polite">
        <div className="success-mark" aria-hidden="true">✓</div>
        <div>
          <span className="step-kicker">YOU&apos;RE READY</span>
          <h2>Thanks, {result.firstName}!</h2>
          <p>Your unique referral link is ready. We also queued your welcome and tracking email.</p>
        </div>
        <div className="copy-box">
          <code>{link}</code>
          <button type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
        </div>
        <div className="share-row" aria-label="Share your referral link">
          <a href={`sms:?&body=${shareText}%20${encodeURIComponent(link)}`}>Text</a>
          <a href={`mailto:?subject=${encodeURIComponent("A NuVision referral for you")}&body=${shareText}%20${encodeURIComponent(link)}`}>Email</a>
          <a href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(link)}`}>WhatsApp</a>
          <Link href={trackPath}>Track referrals</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="signup-grid" onSubmit={submit}>
      <div className="field">
        <label htmlFor="signup-first-name">First name</label>
        <input id="signup-first-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} name="firstName" placeholder="Joe" autoComplete="given-name" required aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? "signup-first-name-error" : undefined} />
        {fieldErrors.firstName ? <p className="field-error" id="signup-first-name-error" role="alert">{fieldErrors.firstName}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="signup-last-name">Last name</label>
        <input id="signup-last-name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} name="lastName" placeholder="Root" autoComplete="family-name" required aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? "signup-last-name-error" : undefined} />
        {fieldErrors.lastName ? <p className="field-error" id="signup-last-name-error" role="alert">{fieldErrors.lastName}</p> : null}
      </div>
      <div className="field field-wide">
        <label htmlFor="signup-email">Email address</label>
        <input id="signup-email" value={form.email} onChange={(event) => update("email", event.target.value)} name="email" type="email" placeholder="you@example.com" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "signup-email-error" : undefined} />
        {fieldErrors.email ? <p className="field-error" id="signup-email-error" role="alert">{fieldErrors.email}</p> : null}
      </div>
      <div className="field field-wide">
        <label htmlFor="signup-phone">Mobile number</label>
        <input id="signup-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} name="phone" type="tel" inputMode="tel" maxLength={20} placeholder="(602) 555-0123" autoComplete="tel" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "signup-phone-error" : undefined} />
        {fieldErrors.phone ? <p className="field-error" id="signup-phone-error" role="alert">{fieldErrors.phone}</p> : null}
      </div>
      {error ? <p className="form-error field-wide" role="alert">{error}</p> : null}
      <button className="button button-primary field-wide" type="submit">Create my link</button>
      <p className="legal-copy field-wide">By continuing, you agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Program Terms</a> and <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>, and consent to program emails and texts about your referrals. Message and data rates may apply; message frequency varies. Reply STOP to opt out.</p>
    </form>
  );
}
