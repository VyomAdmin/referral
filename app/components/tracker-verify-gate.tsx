"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyCustomerAccessAction, verifyReferrerAccessAction } from "../lib/tracker-verification.ts";

const copy = {
  referrer: { heading: "Confirm your details to view referrals", body: "Enter the email and phone number you signed up with. This keeps your referral activity private even if the tracking link is shared or found.", buttonLabel: "View my referrals" },
  customer: { heading: "Confirm your details to view your service request", body: "Enter the email and phone number you used when you were referred. This keeps your service details private even if the tracking link is shared or found.", buttonLabel: "View my service request" },
} as const;

export function TrackerVerifyGate({ kind, token }: { kind: "referrer" | "customer"; token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const text = copy[kind];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const action = kind === "referrer" ? verifyReferrerAccessAction : verifyCustomerAccessAction;
    const result = await action(token, email, phone);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="tracker-verify page-width">
      <div className="flow-panel">
        <form className="zip-form" onSubmit={handleSubmit} noValidate>
          <span className="step-kicker">VERIFY IT&apos;S YOU</span>
          <h2>{text.heading}</h2>
          <p>{text.body}</p>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Last 4 digits of your phone number
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0123" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Checking…" : text.buttonLabel}</button>
        </form>
      </div>
    </section>
  );
}
