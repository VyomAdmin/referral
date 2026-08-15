"use client";

import { useActionState } from "react";
import { confirmTotpEnrollment } from "../lib/totp-actions";

export function TotpEnrollmentForm({ secret, qrCodeDataUrl }: { secret: string; qrCodeDataUrl: string }) {
  const [result, formAction, pending] = useActionState(confirmTotpEnrollment, undefined);

  if (result === "success") {
    return (
      <div className="link-result" aria-live="polite">
        <div className="success-mark" aria-hidden="true">✓</div>
        <div>
          <span className="step-kicker">SECURED</span>
          <h2>Two-factor authentication is on</h2>
          <p>You&apos;ll be asked for a 6-digit code the next time you sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="totp-enrollment">
      <img className="totp-qr" src={qrCodeDataUrl} alt="Scan with an authenticator app" width={168} height={168} />
      <form action={formAction} className="signup-grid">
        <p className="field-wide totp-instructions">Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the current 6-digit code to confirm.</p>
        <input type="hidden" name="secret" value={secret} />
        <label className="field-wide">
          6-digit code
          <input name="code" type="text" inputMode="numeric" pattern="\d{6}" required autoComplete="one-time-code" />
        </label>
        {result ? <p role="alert" className="form-error field-wide">{result}</p> : null}
        <div className="field-wide">
          <button className="admin-primary-button" type="submit" disabled={pending}>{pending ? "Confirming…" : "Enable two-factor authentication"}</button>
        </div>
      </form>
    </div>
  );
}
