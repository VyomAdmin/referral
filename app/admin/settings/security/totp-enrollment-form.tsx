"use client";

import { useActionState } from "react";
import { confirmTotpEnrollment } from "./actions";

export function TotpEnrollmentForm({ secret, qrCodeDataUrl }: { secret: string; qrCodeDataUrl: string }) {
  const [result, formAction, pending] = useActionState(confirmTotpEnrollment, undefined);

  if (result === "success") {
    return <p className="admin-notice" role="status">Two-factor authentication is now enabled on your account.</p>;
  }

  return (
    <form action={formAction} className="totp-enrollment-form">
      <img src={qrCodeDataUrl} alt="Scan with an authenticator app" width={200} height={200} />
      <p>Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the current 6-digit code to confirm.</p>
      <input type="hidden" name="secret" value={secret} />
      <label>
        6-digit code
        <input name="code" type="text" inputMode="numeric" pattern="\d{6}" required autoComplete="one-time-code" />
      </label>
      {result ? <p role="alert" className="admin-login-error">{result}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Confirming…" : "Enable two-factor authentication"}</button>
    </form>
  );
}
