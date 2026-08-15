"use client";

import { useActionState, useState } from "react";
import { inviteUserAction } from "../lib/invite-actions";
import { ASSIGNABLE_ROLES } from "../lib/roles";

export function AddUserForm() {
  const [state, formAction, pending] = useActionState(inviteUserAction, undefined);
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl(inviteUrl: string) {
    const fullUrl = `${window.location.origin}${inviteUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (state?.status === "success") {
    return (
      <div className="link-result" aria-live="polite">
        <div className="success-mark" aria-hidden="true">✓</div>
        <div>
          <span className="step-kicker">INVITE READY</span>
          <h2>Send this link to your new teammate</h2>
          <p>There&apos;s no email sending configured yet, so it isn&apos;t sent automatically — copy it and share it yourself.</p>
        </div>
        <div className="copy-box">
          <code data-testid="invite-url">{`${window.location.origin}${state.inviteUrl}`}</code>
          <button type="button" onClick={() => copyInviteUrl(state.inviteUrl)}>{copied ? "Copied" : "Copy link"}</button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="signup-grid">
      <label>
        Name
        <input name="name" type="text" required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label className="field-wide">
        Role
        <select name="role" defaultValue={ASSIGNABLE_ROLES[0]} required>
          {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>
      {state?.status === "error" ? <p role="alert" className="form-error field-wide">{state.message}</p> : null}
      <div className="field-wide">
        <button className="admin-primary-button" type="submit" disabled={pending}>{pending ? "Inviting…" : "Add user"}</button>
      </div>
    </form>
  );
}
