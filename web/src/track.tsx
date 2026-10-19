import { useState } from "react";
import { postJson } from "./api.ts";
import { Field } from "./shell.tsx";

type ReferrerTrack = {
  ok: true;
  code: string;
  totals: { referrals: number; installComplete: number; rewardsEligible: number; rewardsPaid: number };
  referrals: { id: string; customerFirstName: string; state: string; stage: string; rewardStatus: string }[];
};

type CustomerTrack = { ok: true; stage: string; state: string; zip: string };

export function Track() {
  const [referrer, setReferrer] = useState<ReferrerTrack | null>(null);
  const [customer, setCustomer] = useState<CustomerTrack | null>(null);
  const [error, setError] = useState("");

  async function onReferrer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCustomer(null);
    const form = new FormData(event.currentTarget);
    const { body } = await postJson<ReferrerTrack & { error?: string }>("/api/track/referrer", { email: form.get("email"), phone: form.get("phone") });
    if (!body.ok) {
      setReferrer(null);
      setError(body.error ?? "No match.");
      return;
    }
    setReferrer(body);
  }

  async function onCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReferrer(null);
    const form = new FormData(event.currentTarget);
    const { body } = await postJson<CustomerTrack & { error?: string }>("/api/track/customer", { token: form.get("token") });
    if (!body.ok) {
      setCustomer(null);
      setError(body.error ?? "No match.");
      return;
    }
    setCustomer(body);
  }

  return (
    <section className="panel">
      <h1>Track</h1>
      <h2>Referrer</h2>
      <form onSubmit={onReferrer}>
        <Field label="Email"><input name="email" type="email" required /></Field>
        <Field label="Mobile number"><input name="phone" type="tel" required /></Field>
        <button type="submit">Show my referrals</button>
      </form>
      {referrer ? (
        <div className="result">
          <p>Code {referrer.code}</p>
          <p>{referrer.totals.referrals} referrals, {referrer.totals.installComplete} installs complete, {referrer.totals.rewardsEligible} eligible, {referrer.totals.rewardsPaid} paid.</p>
          <ul>
            {referrer.referrals.map((row) => (
              <li key={row.id}>{row.customerFirstName} · {row.state} · {row.stage} · reward {row.rewardStatus}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <h2>Customer</h2>
      <form onSubmit={onCustomer}>
        <Field label="Tracking token"><input name="token" required /></Field>
        <button type="submit">Show my request</button>
      </form>
      {customer ? (
        <div className="result">
          <p>Stage: {customer.stage}</p>
          <p>State: {customer.state}</p>
          <p>ZIP: {customer.zip}</p>
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
