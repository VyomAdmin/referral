import { AdminDashboard } from "../components/admin-dashboard";
import { auth, signOut } from "../lib/auth";

export const metadata = { title: "Referral operations" };

export default async function AdminPage() {
  const session = await auth();
  const currentUser = { name: session?.user?.name ?? "Team member", role: session?.user?.role ?? "member" };

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return <AdminDashboard currentUser={currentUser} signOutAction={signOutAction} />;
}
