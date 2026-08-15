"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "./actions";

export function AcceptInviteForm({ token, email, name, role }: { token: string; email: string; name: string; role: string }) {
  const [error, formAction, pending] = useActionState(acceptInviteAction, undefined);

  return (
    <form action={formAction} className="signup-grid">
      <input type="hidden" name="token" value={token} />
      <p className="field-wide">Set a password for <strong>{name}</strong> ({email}), joining as <strong>{role}</strong>.</p>
      <label className="field-wide">
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      {error ? <p role="alert" className="form-error field-wide">{error}</p> : null}
      <div className="field-wide">
        <button className="button button-primary admin-login-submit" type="submit" disabled={pending}>{pending ? "Creating account…" : "Set password and sign in"}</button>
      </div>
    </form>
  );
}
