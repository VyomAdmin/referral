"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

export function LoginForm() {
  const [error, formAction, pending] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="admin-login-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Authentication code
        <input name="totpCode" type="text" inputMode="numeric" pattern="\d{6}" placeholder="6-digit code (if enrolled)" autoComplete="one-time-code" />
      </label>
      {error ? <p role="alert" className="admin-login-error">{error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
