import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { teamMembers, users } from "../../db/schema.ts";
import { AdminDashboard } from "../components/admin-dashboard";
import { auth, requireRole, signOut } from "../lib/auth";
import { ADMIN_ROLES } from "../lib/roles";
import { generateTotpSecret, totpEnrollmentQrCode } from "../lib/totp";
import { getAdminCampaigns, getAdminEmailEvents, getAdminReferrals, getAdminReferrerStats } from "../lib/admin-queries";
import { getCampaignEmailTemplates, getCampaignSmsTemplates } from "../lib/campaign-templates.ts";
import type { CampaignEmailTemplate, CampaignSmsTemplate } from "../lib/campaign-templates.ts";
import type { AdminReferral } from "../lib/admin-data";
import type { AdminCampaign, AdminEmailEvent, AdminReferrerStats } from "../lib/admin-queries";

export const metadata = { title: "Referral operations" };

export default async function AdminPage() {
  const session = await auth();
  const currentUser = { name: session?.user?.name ?? "Team member", role: session?.user?.role ?? "member" };

  let members: { id: string; name: string; email: string; role: string; status: string }[] = [];
  if (session?.user?.organizationId && requireRole(session, ADMIN_ROLES)) {
    members = await getDb().select().from(teamMembers).where(eq(teamMembers.organizationId, session.user.organizationId));
  }

  let referrals: AdminReferral[] = [];
  let referrerStats: AdminReferrerStats = { total: 0, joinedThisMonth: 0 };
  let emailEvents: AdminEmailEvent[] = [];
  let campaigns: AdminCampaign[] = [];
  if (session?.user?.organizationId) {
    [referrals, referrerStats, emailEvents, campaigns] = await Promise.all([
      getAdminReferrals(session.user.organizationId),
      getAdminReferrerStats(session.user.organizationId),
      getAdminEmailEvents(session.user.organizationId),
      getAdminCampaigns(session.user.organizationId),
    ]);
  }

  let emailTemplates: CampaignEmailTemplate[] = [];
  let smsTemplates: CampaignSmsTemplate[] = [];
  if (campaigns.length > 0) {
    const [emailLists, smsLists] = await Promise.all([
      Promise.all(campaigns.map((campaign) => getCampaignEmailTemplates(campaign.id))),
      Promise.all(campaigns.map((campaign) => getCampaignSmsTemplates(campaign.id))),
    ]);
    emailTemplates = emailLists.flat();
    smsTemplates = smsLists.flat();
  }

  let totpEnabled = false;
  let totpSecret = "";
  let totpQrCodeDataUrl = "";
  if (session?.user?.id) {
    const [user] = await getDb().select().from(users).where(eq(users.id, session.user.id)).limit(1);
    totpEnabled = user?.totpEnabled ?? false;
    if (user && !totpEnabled) {
      totpSecret = generateTotpSecret();
      totpQrCodeDataUrl = await totpEnrollmentQrCode(user.email, totpSecret);
    }
  }

  const integrationsStatus = {
    hubspotConfigured: Boolean(process.env.HUBSPOT_PIPELINE_ID && process.env.HUBSPOT_PRIVATE_APP_TOKEN),
    gmailConfigured: Boolean(process.env.GMAIL_AUTH_EMAIL && process.env.GMAIL_APP_PASSWORD),
    twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
  };

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <AdminDashboard
      currentUser={currentUser}
      signOutAction={signOutAction}
      teamMembers={members}
      initialReferrals={referrals}
      initialCampaigns={campaigns}
      initialEmailTemplates={emailTemplates}
      initialSmsTemplates={smsTemplates}
      integrationsStatus={integrationsStatus}
      referrerStats={referrerStats}
      emailEvents={emailEvents}
      totpEnabled={totpEnabled}
      totpSecret={totpSecret}
      totpQrCodeDataUrl={totpQrCodeDataUrl}
    />
  );
}
