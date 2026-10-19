import { useEffect, useState } from "react";
import { postJson, type PublicConfig } from "./api.ts";
import { Field } from "./shell.tsx";

export function Quote({ config, code }: { config: PublicConfig; code: string }) {
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => setStartedAt(Date.now()), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const { status, body } = await postJson<{ ok?: boolean; trackToken?: string; error?: string }>("/api/quote", {
      referralCode: code,
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone"),
      zip: form.get("zip"),
      vehicleYear: form.get("vehicleYear"),
      vehicleMake: form.get("vehicleMake"),
      vehicleModel: form.get("vehicleModel"),
      consent: form.get("consent") === "on",
      smsConsent: form.get("smsConsent") === "on",
      honeypot: form.get("company_website"),
      startedAt,
    });
    if (status !== 200 || !body.trackToken) {
      setError(body.error ?? "Could not submit the referral.");
      return;
    }
    setToken(body.trackToken);
  }

  return (
    <section className="panel">
      <p className="eyebrow">Referred customer</p>
      <h1>Request a quote</h1>
      <p>Referral code: {code || "not set"}</p>
      <p>Customer benefit: {config.customerBenefit}</p>
      {token ? (
        <div className="result">
          <h2>Request received</h2>
          <p>Save this tracking token. It does not show anyone's reward.</p>
          <p className="code">{token}</p>
          <a href="/track">Track the request</a>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <Field label="ZIP code"><input name="zip" required inputMode="numeric" pattern="\d{5}" /></Field>
          <Field label="First name"><input name="firstName" required /></Field>
          <Field label="Last name"><input name="lastName" required /></Field>
          <Field label="Email"><input name="email" type="email" required /></Field>
          <Field label="Mobile number"><input name="phone" type="tel" required /></Field>
          <Field label="Vehicle year"><input name="vehicleYear" inputMode="numeric" /></Field>
          <Field label="Vehicle make"><input name="vehicleMake" /></Field>
          <Field label="Vehicle model"><input name="vehicleModel" /></Field>
          <div className="hp" aria-hidden="true">
            <label>Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <label className="check">
            <input name="consent" type="checkbox" required />
            <span>I agree to the <a href="/terms">terms</a>.</span>
          </label>
          <p className="disclosure">{config.smsConsentText}</p>
          <label className="check">
            <input name="smsConsent" type="checkbox" required />
            <span>I agree to the text-message disclosure above.</span>
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit">Submit</button>
        </form>
      )}
    </section>
  );
}
