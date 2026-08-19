"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { lookupTrackerLinksAction, type TrackerLookupResult } from "../lib/tracker-lookup.ts";

export function TrackerLookup() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TrackerLookupResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const outcome = await lookupTrackerLinksAction(email, phone);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setResult(outcome);
  }

  if (result?.ok) {
    const links = [
      ...(result.referrerTrack ? [{ href: result.referrerTrack, label: "Your referral activity", helper: "See everyone you've referred and reward status." }] : []),
      ...result.customerTracks.map((track) => ({ href: track.trackPath, label: `Your service request (${track.state} ${track.zip})`, helper: "See the status of the referral you accepted." })),
    ];
    return (
      <section className="tracker-verify page-width">
        <div className="flow-panel">
          <span className="step-kicker">FOUND IT</span>
          <h2>Here&apos;s what we found for you</h2>
          <div className="found-links" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {links.map((link) => (
              <Link key={link.href} className="button button-primary" href={link.href} style={{ display: "block", textAlign: "left" }}>
                {link.label}
                <br />
                <small>{link.helper}</small>
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tracker-verify page-width">
      <div className="flow-panel">
        <form className="zip-form" onSubmit={handleSubmit} noValidate>
          <span className="step-kicker">FIND MY LINK</span>
          <h2>Track your referral</h2>
          <p>Whether you referred a friend or were referred yourself, enter the email and phone number on file and we&apos;ll bring up your tracker.</p>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Last 4 digits of your phone number
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0123" required />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Looking…" : "Find my tracker"}</button>
        </form>
      </div>
    </section>
  );
}
