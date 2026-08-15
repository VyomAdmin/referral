import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/index.ts";
import { teamMembers } from "../../../../db/schema.ts";
import { auth, requireRole } from "../../../lib/auth";
import { ADMIN_ROLES } from "../../../lib/roles";
import { AddUserForm } from "./add-user-form";

export const metadata = { title: "Manage users" };

export default async function ManageUsersPage() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  if (!requireRole(session, ADMIN_ROLES)) {
    return <main className="admin-settings-page"><p>You don&apos;t have permission to manage users.</p></main>;
  }

  const members = await getDb().select().from(teamMembers).where(eq(teamMembers.organizationId, session.user.organizationId));

  return (
    <main className="admin-settings-page">
      <h1>Manage users</h1>
      <div className="admin-card">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td><strong>{member.name}</strong></td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td><span className={`admin-status ${member.status === "active" ? "status-installed" : "status-scheduled"}`}>{member.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h2>Add user</h2>
      <AddUserForm />
    </main>
  );
}
