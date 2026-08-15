import { Brand } from "../../../components/brand";
import { verifyInviteToken } from "../../../lib/invite-tokens";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata = { title: "Accept invite" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await verifyInviteToken(token);

  return (
    <main className="public-page">
      <header className="public-header">
        <div className="page-width header-inner">
          <Brand />
        </div>
      </header>
      <section className="admin-login-shell page-width">
        <div className="hero-card admin-login-card">
          <Brand compact />
          {invite ? (
            <>
              <h1>You&apos;re invited</h1>
              <AcceptInviteForm token={token} email={invite.email} name={invite.name} role={invite.role} />
            </>
          ) : (
            <>
              <h1>Invite not found</h1>
              <p>This invite link is invalid, expired, or has already been used. Ask whoever invited you to send a new one.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
