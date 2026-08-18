import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { teamMembers, users } from "../../db/schema.ts";
import { AdminDashboard } from "../components/admin-dashboard";
import { auth, requireRole, signOut } from "../lib/auth";
import { ADMIN_ROLES } from "../lib/roles";
import { generateTotpSecret, totpEnrollmentQrCode } from "../lib/totp";
import { getAdminReferrals } from "../lib/admin-queries";
import type { AdminReferral } from "../lib/admin-data";

export const metadata = { title: "Referral operations" };

export default async function AdminPage() {
  const session = await auth();
  const currentUser = { name: session?.user?.name ?? "Team member", role: session?.user?.role ?? "member" };

  let members: { id: string; name: string; email: string; role: string; status: string }[] = [];
  if (session?.user?.organizationId && requireRole(session, ADMIN_ROLES)) {
    members = await getDb().select().from(teamMembers).where(eq(teamMembers.organizationId, session.user.organizationId));
  }

  let referrals: AdminReferral[] = [];
  if (session?.user?.organizationId) {
    referrals = await getAdminReferrals(session.user.organizationId);
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
      totpEnabled={totpEnabled}
      totpSecret={totpSecret}
      totpQrCodeDataUrl={totpQrCodeDataUrl}
    />
  );
}
