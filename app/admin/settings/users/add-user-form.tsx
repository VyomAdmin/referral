"use client";

import { useActionState, useState } from "react";
import { inviteUserAction } from "./actions";
import { ASSIGNABLE_ROLES } from "../../../lib/roles";

export function AddUserForm() {
  const [state, formAction, pending] = useActionState(inviteUserAction, undefined);
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl(inviteUrl: string) {
    const fullUrl = `${window.location.origin}${inviteUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
  }

  return (
    <div className="admin-card add-user-card">
      <form action={formAction} className="add-user-form" onSubmit={() => setCopied(false)}>
        <label>
          Name
          <input name="name" type="text" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role" defaultValue={ASSIGNABLE_ROLES[0]} required>
            {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <button className="admin-primary-button" type="submit" disabled={pending}>{pending ? "Inviting…" : "Add user"}</button>
      </form>
      {state?.status === "error" ? <p role="alert" className="admin-login-error">{state.message}</p> : null}
      {state?.status === "success" ? (
        <div className="admin-notice" role="status">
          <span>✓</span>
          Invite created. Send this link to the new teammate — there&apos;s no email sending configured yet, so it isn&apos;t sent automatically.
          <button type="button" onClick={() => copyInviteUrl(state.inviteUrl)}>{copied ? "Copied!" : "Copy invite link"}</button>
        </div>
      ) : null}
    </div>
  );
}
