import { notFound } from "next/navigation";
import { AdminDashboardPage } from "../dashboard-page";
import { ADMIN_SECTIONS, type AdminSection } from "../../lib/admin-sections";

export const metadata = { title: "Referral operations" };

// Bookmarkable dashboard views (cutover audit A-05). Static siblings —
// /admin/login and /admin/invite — still win over this dynamic segment, so
// those routes are unaffected. Anything that isn't a known section 404s rather
// than silently falling back to Overview, which would make a typo'd or stale
// bookmark look like it worked.
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!ADMIN_SECTIONS.includes(section as AdminSection)) notFound();
  return <AdminDashboardPage initialSection={section as AdminSection} />;
}
