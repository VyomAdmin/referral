import { AdminDashboardPage } from "./dashboard-page";

export const metadata = { title: "Referral operations" };

// /admin keeps working as the dashboard root; /admin/<section> renders the same
// dashboard opened on a specific view (cutover audit A-05 — views were not
// bookmarkable or shareable before).
export default async function AdminPage() {
  return AdminDashboardPage({});
}
