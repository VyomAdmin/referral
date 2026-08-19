"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyReferrerAccessAction } from "../lib/tracker-verification.ts";

export function ReferrerVerifyGate({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await verifyReferrerAccessAction(token, email, phone);
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
          <h2>Confirm your details to view referrals</h2>
          <p>Enter the email and phone number you signed up with. This keeps your referral activity private even if the tracking link is shared or found.</p>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Last 4 digits of your phone number
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0123" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Checking…" : "View my referrals"}</button>
        </form>
      </div>
    </section>
  );
}
