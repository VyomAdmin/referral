import { useEffect, useState } from "react";
import { postJson, type PublicConfig } from "./api.ts";
import { Field } from "./shell.tsx";

type SignupOk = { ok: true; code: string; link: string; existing: boolean; rewardAmount: string; payoutLine: string };

export function Home({ config }: { config: PublicConfig }) {
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SignupOk | null>(null);
  useEffect(() => setStartedAt(Date.now()), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const { status, body } = await postJson<SignupOk & { error?: string }>("/api/signup", {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone"),
      consent: form.get("consent") === "on",
      smsConsent: form.get("smsConsent") === "on",
      honeypot: form.get("company_website"),
      startedAt,
    });
    if (status !== 200 || !body.ok) {
      setError(body.error ?? "Could not create the referral link.");
      return;
    }
    setResult(body);
  }

  const shareText = result ? `Use my referral link: ${result.link}` : "";
  return (
    <section className="panel" id="join">
      <p className="eyebrow">Referral program</p>
      <h1>Share a referral link</h1>
      <p>When a referred installation is complete, a reward can become eligible. The amount is {config.rewardAmount ?? "not set"}.</p>
      <p className="neutral">{config.payoutLine ?? "not set"}</p>
      <p>Offer: {config.offerText}</p>
      {result ? (
        <div className="result">
          <h2>{result.existing ? "Your existing link" : "Your link is ready"}</h2>
          <p className="code">{result.code}</p>
          <p>{result.link}</p>
          <div className="row">
            <button type="button" onClick={() => navigator.clipboard.writeText(result.link)}>Copy</button>
            <a href={`sms:?&body=${encodeURIComponent(shareText)}`}>Text</a>
            <a href={`mailto:?subject=${encodeURIComponent("Referral link")}&body=${encodeURIComponent(shareText)}`}>Email</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <Field label="First name"><input name="firstName" required autoComplete="given-name" /></Field>
          <Field label="Last name"><input name="lastName" required autoComplete="family-name" /></Field>
          <Field label="Email"><input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Mobile number"><input name="phone" type="tel" required autoComplete="tel" /></Field>
          <div className="hp" aria-hidden="true">
            <label>Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <label className="check">
            <input name="consent" type="checkbox" required />
            <span>I agree to the <a href="/terms">terms</a>. The stored text is the placeholder until counsel approves it.</span>
          </label>
          <p className="disclosure">{config.smsConsentText}</p>
          <label className="check">
            <input name="smsConsent" type="checkbox" required />
            <span>I agree to the text-message disclosure above.</span>
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit">Create my link</button>
        </form>
      )}
    </section>
  );
}
