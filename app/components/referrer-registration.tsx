"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { isValidPhone } from "../lib/referral-rules";
import { submitReferrerRegistrationAction } from "../lib/referrer-actions";

type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

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

  const link = useMemo(
    () => (result ? `${typeof window === "undefined" ? "https://refer.nuvisionautoglass.com" : window.location.origin}/r/${result.code}` : ""),
    [result],
  );

  function update(field: keyof Registration, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || !isValidPhone(form.phone)) {
      setError("Please complete every field with a valid email and a 10-digit mobile number.");
      return;
    }
    const outcome = await submitReferrerRegistrationAction(form);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setTrackPath(outcome.trackPath);
    setResult({ code: outcome.code, firstName: outcome.firstName });
    setError("");
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
    <form className="signup-grid" onSubmit={submit} noValidate>
      <label>
        First name
        <input value={form.firstName} onChange={(event) => update("firstName", event.target.value)} name="firstName" placeholder="Sandeep" autoComplete="given-name" />
      </label>
      <label>
        Last name
        <input value={form.lastName} onChange={(event) => update("lastName", event.target.value)} name="lastName" placeholder="Jha" autoComplete="family-name" />
      </label>
      <label className="field-wide">
        Email address
        <input value={form.email} onChange={(event) => update("email", event.target.value)} name="email" type="email" placeholder="you@example.com" autoComplete="email" />
      </label>
      <label className="field-wide">
        Mobile number
        <input value={form.phone} onChange={(event) => update("phone", event.target.value)} name="phone" type="tel" inputMode="tel" maxLength={20} placeholder="(602) 555-0123" autoComplete="tel" />
      </label>
      {error ? <p className="form-error field-wide" role="alert">{error}</p> : null}
      <button className="button button-primary field-wide" type="submit">Create my link</button>
      <p className="legal-copy field-wide">By continuing, you agree to the referral program terms and consent to necessary program emails.</p>
    </form>
  );
}
