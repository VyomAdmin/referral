import Link from "next/link";

export const metadata = { title: "Settings" };

export default function SettingsHubPage() {
  return (
    <main className="admin-settings-page">
      <h1>Settings</h1>
      <div className="settings-hub-grid">
        <Link className="admin-card settings-hub-card" href="/admin/settings/users">
          <strong>Manage users</strong>
          <p>Invite teammates and control who has access to the admin dashboard.</p>
        </Link>
        <Link className="admin-card settings-hub-card" href="/admin/settings/security">
          <strong>Security</strong>
          <p>Enable two-factor authentication for your own account.</p>
        </Link>
      </div>
    </main>
  );
}
