"use client";

import { useMemo, useState } from "react";
import { Brand } from "./brand";
import { AddUserForm } from "./add-user-form";
import { TotpEnrollmentForm } from "./totp-enrollment-form";
import { AdminReferral, ReferralStatus, demoEmailEvents, demoTeam } from "../lib/admin-data";
import { canMarkRewardPaid, searchReferrals, statusLabel } from "../lib/admin-rules";
import { mintTrackerLinkAction } from "../lib/tracker-actions";
import { ADMIN_ROLES } from "../lib/roles";

type Section = "overview" | "referrals" | "campaigns" | "rewards" | "emails" | "analytics" | "team" | "integrations" | "settings";

const sections: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "⌂" },
  { key: "referrals", label: "Referrals & people", icon: "↗" },
  { key: "campaigns", label: "Campaigns & states", icon: "◎" },
  { key: "rewards", label: "Rewards", icon: "$" },
  { key: "emails", label: "Emails", icon: "✉" },
  { key: "analytics", label: "Analytics", icon: "▥" },
  { key: "team", label: "Team & roles", icon: "♙" },
  { key: "integrations", label: "Integrations", icon: "⌁" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

type TeamMember = { id: string; name: string; email: string; role: string; status: string };

type Campaign = { state: string; name: string; offer: string; reward: string; leads: number; active: boolean; color: string };

const campaignSeed: Campaign[] = [
  { state: "AZ", name: "Arizona Friends & Family", offer: "$50 customer benefit", reward: "$50 referrer reward", leads: 291, active: true, color: "sun" },
  { state: "FL", name: "Florida Friends & Family", offer: "No customer offer", reward: "$50 referrer reward", leads: 148, active: true, color: "ocean" },
];

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function AdminDashboard({ currentUser, signOutAction, teamMembers, initialReferrals, totpEnabled, totpSecret, totpQrCodeDataUrl }: {
  currentUser: { name: string; role: string };
  signOutAction: () => Promise<void>;
  teamMembers: TeamMember[];
  initialReferrals: AdminReferral[];
  totpEnabled: boolean;
  totpSecret: string;
  totpQrCodeDataUrl: string;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("All states");
  const [statusFilter, setStatusFilter] = useState<"All statuses" | ReferralStatus>("All statuses");
  const [selected, setSelected] = useState<AdminReferral | null>(null);
  const [referrals, setReferrals] = useState(initialReferrals);
  const [campaigns, setCampaigns] = useState(campaignSeed);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState("");

  const filteredReferrals = useMemo(() => {
    let matches = searchReferrals(referrals, query);
    if (stateFilter !== "All states") matches = matches.filter((referral) => referral.state === stateFilter);
    if (statusFilter !== "All statuses") matches = matches.filter((referral) => referral.status === statusFilter);
    return matches;
  }, [query, referrals, stateFilter, statusFilter]);

  function markPaid(referral: AdminReferral) {
    if (!canMarkRewardPaid(referral)) {
      setNotice("Payment is blocked until installation completion is confirmed.");
      return;
    }
    setReferrals((current) => current.map((item) => item.id === referral.id ? { ...item, status: "paid" } : item));
    setNotice(`${referral.id} was marked paid and added to the audit log.`);
  }

  function saveCampaign(updated: Campaign) {
    setCampaigns((current) => current.map((campaign) => (campaign.state === updated.state ? updated : campaign)));
    setEditingCampaign(null);
    setNotice(`${updated.name} was updated.`);
  }

  async function mintTrackerLink() {
    const path = await mintTrackerLinkAction("customer");
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setNotice(`Tracker link copied: ${url}`);
  }

  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><Brand compact /><span>REFERRALS</span></div>
        <nav aria-label="Operations navigation">
          {sections.map((item) => (
            <button className={section === item.key ? "active" : ""} key={item.key} onClick={() => { setSection(item.key); setSelected(null); }} type="button">
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <form className="admin-sidebar-foot" action={signOutAction}>
          <span className="team-avatar">{initials(currentUser.name)}</span>
          <div><strong>{currentUser.name}</strong><small>{currentUser.role}</small></div>
          <button type="submit" aria-label="Sign out" title="Sign out">•••</button>
        </form>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-breadcrumb">NuVision /</span><strong>{sections.find((item) => item.key === section)?.label}</strong></div>
          <div className="admin-top-actions"><span className="sync-chip test-sync-chip"><i /> Test mode • HubSpot simulated</span><button onClick={() => setSection("settings")} aria-label="Settings" title="Settings" type="button">⚙</button><button type="button">?</button><span className="team-avatar">{initials(currentUser.name)}</span></div>
        </header>

        {notice ? <div className="admin-notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} type="button">×</button></div> : null}

        <div className="admin-workspace">
          {section === "overview" ? <Overview onViewReferrals={() => setSection("referrals")} referrals={referrals} /> : null}
          {section === "referrals" ? (
            <ReferralsView query={query} setQuery={setQuery} stateFilter={stateFilter} setStateFilter={setStateFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} referrals={filteredReferrals} onSelect={setSelected} />
          ) : null}
          {section === "campaigns" ? <CampaignsView campaigns={campaigns} onEdit={setEditingCampaign} /> : null}
          {section === "rewards" ? <RewardsView referrals={referrals} onPay={markPaid} /> : null}
          {section === "emails" ? <EmailsView /> : null}
          {section === "analytics" ? <AnalyticsView /> : null}
          {section === "team" ? <TeamView /> : null}
          {section === "integrations" ? <IntegrationsView /> : null}
          {section === "settings" ? (
            <SettingsView currentUserRole={currentUser.role} teamMembers={teamMembers} totpEnabled={totpEnabled} totpSecret={totpSecret} totpQrCodeDataUrl={totpQrCodeDataUrl} />
          ) : null}
        </div>
      </section>

      {selected ? <ReferralDrawer referral={selected} onClose={() => setSelected(null)} onPay={markPaid} onMintTrackerLink={mintTrackerLink} /> : null}
      {editingCampaign ? <CampaignEditDrawer campaign={editingCampaign} onClose={() => setEditingCampaign(null)} onSave={saveCampaign} /> : null}
    </main>
  );
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: string }) {
  return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action ? <button className="admin-primary-button" type="button">+ {action}</button> : null}</div>;
}

function Overview({ onViewReferrals, referrals }: { onViewReferrals: () => void; referrals: AdminReferral[] }) {
  return <>
    <PageTitle eyebrow="Tuesday, August 11" title="Referral operations" description="A clear view from first share to final reward." action="New campaign" />
    <div className="admin-metric-grid">
      <article><div><span>Active referrers</span><small className="trend-up">+12.4%</small></div><strong>440</strong><p>38 joined this month</p></article>
      <article><div><span>Referral forms</span><small className="trend-up">+8.1%</small></div><strong>506</strong><p>291 installation-qualified</p></article>
      <article><div><span>Installed</span><small className="trend-up">+5.6%</small></div><strong>291</strong><p>57.5% form-to-install</p></article>
      <article className="admin-metric-money"><div><span>Rewards outstanding</span><small>18 rewards</small></div><strong>$900</strong><p>$7,250 paid all time</p></article>
    </div>
    <div className="overview-grid">
      <section className="admin-card performance-card"><div className="admin-card-head"><div><span>PERFORMANCE</span><h2>Referral funnel</h2></div><select><option>Last 30 days</option></select></div><div className="funnel-bars">
        {[{ label: "Forms submitted", value: 506, width: "100%" }, { label: "Appointments", value: 374, width: "74%" }, { label: "Installations", value: 291, width: "57.5%" }, { label: "Rewards paid", value: 273, width: "54%" }].map((bar) => <div key={bar.label}><span>{bar.label}</span><div><i style={{ width: bar.width }} /></div><strong>{bar.value}</strong></div>)}
      </div><button className="text-button" onClick={onViewReferrals} type="button">View all referrals →</button></section>
      <section className="admin-card activity-card"><div className="admin-card-head"><div><span>LIVE ACTIVITY</span><h2>Needs attention</h2></div><span className="alert-count">4</span></div>
        <article><span className="attention-icon warning-icon">$</span><div><strong>18 rewards await payment</strong><small>Oldest eligible for 3 days</small></div><button type="button">Review</button></article>
        <article><span className="attention-icon sync-icon">↻</span><div><strong>1 HubSpot sync needs retry</strong><small>REF-482202 • 14 minutes ago</small></div><button type="button">Retry</button></article>
        <article><span className="attention-icon team-icon">2</span><div><strong>Two teammate invitations</strong><small>Waiting for acceptance</small></div><button type="button">View</button></article>
      </section>
    </div>
    <div className="admin-card recent-card"><div className="admin-card-head"><div><span>LATEST REFERRALS</span><h2>Recent activity</h2></div><button className="text-button" onClick={onViewReferrals} type="button">See all →</button></div><ReferralTable referrals={referrals.slice(0, 4)} />{referrals.length === 0 ? <p className="empty-table"><strong>No referrals yet</strong></p> : null}</div>
  </>;
}

function ReferralsView({ query, setQuery, stateFilter, setStateFilter, statusFilter, setStatusFilter, referrals, onSelect }: { query: string; setQuery: (value: string) => void; stateFilter: string; setStateFilter: (value: string) => void; statusFilter: "All statuses" | ReferralStatus; setStatusFilter: (value: "All statuses" | ReferralStatus) => void; referrals: AdminReferral[]; onSelect: (referral: AdminReferral) => void }) {
  return <><PageTitle eyebrow="CRM OPERATIONS" title="Referrals & people" description="Search any referrer or referred customer across campaigns and HubSpot." action="Create referral" /><div className="table-toolbar"><label className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, code, HubSpot ID…" /></label><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>All states</option><option>AZ</option><option>FL</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All statuses" | ReferralStatus)}><option>All statuses</option><option value="received">{statusLabel("received")}</option><option value="scheduled">{statusLabel("scheduled")}</option><option value="installed">{statusLabel("installed")}</option><option value="paid">{statusLabel("paid")}</option><option value="cancelled">{statusLabel("cancelled")}</option></select><button type="button">Export CSV</button></div><div className="admin-card referral-table-card"><ReferralTable referrals={referrals} onSelect={onSelect} />{referrals.length === 0 ? <div className="empty-table"><strong>No matching referrals</strong><span>Try a different name, phone, code, or filter.</span></div> : null}</div></>;
}

function ReferralTable({ referrals, onSelect }: { referrals: AdminReferral[]; onSelect?: (referral: AdminReferral) => void }) {
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Referral</th><th>Referrer</th><th>Customer</th><th>Market</th><th>Status</th><th>HubSpot</th><th /></tr></thead><tbody>{referrals.map((referral) => <tr key={referral.id} onClick={() => onSelect?.(referral)} className={onSelect ? "clickable-row" : ""}><td><strong>{referral.id}</strong><small>{referral.submittedAt}</small></td><td><strong>{referral.referrer}</strong><small>{referral.referrerEmail}</small></td><td><strong>{referral.customer}</strong><small>{referral.phone}</small></td><td><span className={`market-tag market-${referral.state.toLowerCase()}`}>{referral.state}</span><small>{referral.zip}</small></td><td><span className={`admin-status status-${referral.status}`}>{statusLabel(referral.status)}</span></td><td><strong className="hubspot-id">#{referral.hubspotDealId}</strong><small className={`sync-${referral.syncStatus}`}>{referral.syncStatus}</small></td><td><button aria-label={`Open ${referral.id}`} type="button">›</button></td></tr>)}</tbody></table></div>;
}

function CampaignsView({ campaigns, onEdit }: { campaigns: Campaign[]; onEdit: (campaign: Campaign) => void }) { return <><PageTitle eyebrow="STATE ROUTING" title="Campaigns & offers" description="One referral link automatically selects the correct state experience." action="New campaign" /><div className="campaign-admin-grid">{campaigns.map((campaign) => <article className="campaign-admin-card" key={campaign.state}><div className={`campaign-state campaign-${campaign.color}`}>{campaign.state}</div><div className="campaign-active-row"><span className={campaign.active ? "active-dot" : "paused-dot"}>{campaign.active ? "Active" : "Paused"}</span><button onClick={() => onEdit(campaign)} type="button">•••</button></div><h2>{campaign.name}</h2><p>{campaign.offer}</p><dl><div><dt>Referrer</dt><dd>{campaign.reward}</dd></div><div><dt>Forms submitted</dt><dd>{campaign.leads}</dd></div><div><dt>ZIP routing</dt><dd>Configured</dd></div></dl><button className="campaign-edit" onClick={() => onEdit(campaign)} type="button">Edit campaign</button></article>)}</div></>; }

function CampaignEditDrawer({ campaign, onClose, onSave }: { campaign: Campaign; onClose: () => void; onSave: (campaign: Campaign) => void }) {
  const [form, setForm] = useState(campaign);
  return (
    <div className="drawer-backdrop">
      <button className="drawer-close-backdrop" onClick={onClose} aria-label="Close campaign editor" type="button" />
      <aside className="referral-drawer">
        <header><div><span>{form.state}</span><h2>Edit campaign</h2></div><button onClick={onClose} type="button">×</button></header>
        <form
          className="settings-panel-card admin-card"
          onSubmit={(event) => { event.preventDefault(); onSave(form); }}
        >
          <label>Campaign name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
          <label>Customer offer<input value={form.offer} onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))} /></label>
          <label>Referrer reward<input value={form.reward} onChange={(event) => setForm((current) => ({ ...current, reward: event.target.value }))} /></label>
          <label className="consent-row"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> <span>Campaign is active</span></label>
          <footer><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" type="submit">Save changes</button></footer>
        </form>
      </aside>
    </div>
  );
}

function RewardsView({ referrals, onPay }: { referrals: AdminReferral[]; onPay: (referral: AdminReferral) => void }) { return <><PageTitle eyebrow="FINANCE" title="Reward queue" description="Payments unlock only after an installation-completed signal." /><div className="reward-summary"><article><span>Eligible now</span><strong>$50</strong></article><article><span>Paid this month</span><strong>$1,350</strong></article><article><span>Blocked / pending install</span><strong>$100</strong></article></div><div className="admin-card reward-table"><ReferralTable referrals={referrals.filter((referral) => ["scheduled", "installed", "paid"].includes(referral.status))} /><div className="reward-actions">{referrals.filter((referral) => ["scheduled", "installed"].includes(referral.status)).map((referral) => <div key={referral.id}><span><strong>{referral.id}</strong> • {referral.customer}</span><button disabled={!canMarkRewardPaid(referral)} onClick={() => onPay(referral)} type="button">{canMarkRewardPaid(referral) ? `Mark $${referral.rewardAmount} paid` : "Waiting for installation"}</button></div>)}</div></div></>; }

function EmailsView() { return <><PageTitle eyebrow="COMMUNICATIONS" title="Email activity" description="Referral-specific transactional emails, delivery, and tracker clicks." action="Edit templates" /><div className="admin-metric-grid email-metrics"><article><div><span>Delivered</span><small className="trend-up">98.7%</small></div><strong>1,248</strong><p>Last 30 days</p></article><article><div><span>Opened</span><small>74.2%</small></div><strong>926</strong><p>Industry-safe tracking</p></article><article><div><span>Tracker clicks</span><small>41.8%</small></div><strong>522</strong><p>Secure links opened</p></article><article><div><span>Bounced</span><small>0.8%</small></div><strong>10</strong><p>Needs review</p></article></div><div className="admin-card"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Email</th><th>Recipient</th><th>Template</th><th>Referral</th><th>Status</th><th>Sent</th></tr></thead><tbody>{demoEmailEvents.map((email) => <tr key={email.id}><td><strong>{email.id}</strong></td><td><strong>{email.recipient}</strong></td><td>{email.template}</td><td><span className="hubspot-id">{email.related}</span></td><td><span className="admin-status status-installed">{email.status}</span></td><td>{email.sent}</td></tr>)}</tbody></table></div></div></>; }

function AnalyticsView() { return <><PageTitle eyebrow="PERFORMANCE" title="Referral analytics" description="Understand volume, conversion, markets, and reward efficiency." /><div className="analytics-grid"><section className="admin-card"><div className="admin-card-head"><div><span>MONTHLY VOLUME</span><h2>Forms and installations</h2></div><select><option>Last 6 months</option></select></div><div className="bar-chart">{[43, 58, 51, 72, 64, 86].map((height, index) => <div key={index}><i style={{ height: `${height}%` }} /><b style={{ height: `${height * .58}%` }} /><span>{["Mar", "Apr", "May", "Jun", "Jul", "Aug"][index]}</span></div>)}</div></section><section className="admin-card market-performance"><div className="admin-card-head"><div><span>BY MARKET</span><h2>Installation conversion</h2></div></div>{[["Arizona", "62%", 62], ["Florida", "54%", 54]].map(([name, value, width]) => <div key={String(name)}><span>{name}</span><div><i style={{ width: `${width}%` }} /></div><strong>{value}</strong></div>)}</section></div></>; }

function TeamView() { return <><PageTitle eyebrow="ACCESS CONTROL" title="Team & roles" description="Control operational access and require secure sign-in." action="Invite teammate" /><div className="admin-card"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Teammate</th><th>Role</th><th>Status</th><th>2FA</th><th /></tr></thead><tbody>{demoTeam.map((member) => <tr key={member.email}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.role}</td><td><span className={`admin-status ${member.status === "Active" ? "status-installed" : "status-scheduled"}`}>{member.status}</span></td><td><span className={member.twoFactor ? "two-factor-on" : "two-factor-off"}>{member.twoFactor ? "Enabled" : "Required"}</span></td><td><button type="button">•••</button></td></tr>)}</tbody></table></div></div><div className="role-grid">{[["Owner / Admin", "Full access, settings, integrations, and team permissions."], ["CRM Operations", "Customers, referrals, HubSpot sync, and timelines."], ["Rewards / Finance", "Eligibility review, payout status, and exports."], ["Marketing", "Campaigns, forms, offers, and email templates."]].map(([role, copy]) => <article className="admin-card" key={role}><strong>{role}</strong><p>{copy}</p><button type="button">Edit permissions</button></article>)}</div></>; }

function IntegrationsView() { return <><PageTitle eyebrow="SYSTEM HEALTH" title="Integrations" description="Test mappings and workflows before your developers connect production services." /><div className="integration-grid"><article className="admin-card integration-card"><div className="integration-logo hubspot-logo">H</div><div><span className="paused-dot">Simulated</span><h2>HubSpot CRM</h2><p>Contacts, deals, stage changes, and installation completion use seeded test events.</p></div><dl><div><dt>CRM writes</dt><dd>Disabled</dd></div><div><dt>Webhook endpoint</dt><dd>Awaiting secret</dd></div><div><dt>Test mapping</dt><dd>15 checks passed</dd></div></dl><button type="button">Review mapping</button></article><article className="admin-card integration-card"><div className="integration-logo email-logo">@</div><div><span className="paused-dot">Simulated</span><h2>Transactional email</h2><p>Templates and event previews are active. No messages leave the application.</p></div><dl><div><dt>Live sending</dt><dd>Disabled</dd></div><div><dt>Templates</dt><dd>6 configured</dd></div><div><dt>Provider</dt><dd>Choose before launch</dd></div></dl><button type="button">Preview templates</button></article></div></>; }

function SettingsView({ currentUserRole, teamMembers, totpEnabled, totpSecret, totpQrCodeDataUrl }: {
  currentUserRole: string;
  teamMembers: TeamMember[];
  totpEnabled: boolean;
  totpSecret: string;
  totpQrCodeDataUrl: string;
}) {
  const canManageUsers = ADMIN_ROLES.includes(currentUserRole);
  const [tab, setTab] = useState<"users" | "security">(canManageUsers ? "users" : "security");

  return <>
    <PageTitle eyebrow="ADMINISTRATION" title="Settings" description="Manage who has access and secure your own account." />
    <div className="settings-tabs">
      {canManageUsers ? <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")} type="button">Manage users</button> : null}
      <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")} type="button">Security</button>
    </div>
    {tab === "users" && canManageUsers ? (
      <>
        <div className="admin-card">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {teamMembers.map((member) => (
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
        <h2 className="settings-subheading">Add user</h2>
        <div className="admin-card settings-panel-card"><AddUserForm /></div>
      </>
    ) : null}
    {tab === "security" ? (
      <>
        <h2 className="settings-subheading">Two-factor authentication</h2>
        <div className="admin-card settings-panel-card">
          {totpEnabled ? <p>Two-factor authentication is enabled on your account.</p> : <TotpEnrollmentForm secret={totpSecret} qrCodeDataUrl={totpQrCodeDataUrl} />}
        </div>
      </>
    ) : null}
  </>;
}

function ReferralDrawer({ referral, onClose, onPay, onMintTrackerLink }: { referral: AdminReferral; onClose: () => void; onPay: (referral: AdminReferral) => void; onMintTrackerLink: () => void }) { return <div className="drawer-backdrop"><button className="drawer-close-backdrop" onClick={onClose} aria-label="Close referral details" type="button" /><aside className="referral-drawer"><header><div><span>{referral.id}</span><h2>{referral.customer}</h2></div><button onClick={onClose} type="button">×</button></header><div className="drawer-status"><span className={`admin-status status-${referral.status}`}>{statusLabel(referral.status)}</span><span className={`sync-${referral.syncStatus}`}>HubSpot {referral.syncStatus}</span></div><section><span className="drawer-label">PEOPLE</span><div className="person-pair"><article><small>REFERRER</small><strong>{referral.referrer}</strong><span>{referral.referrerEmail}</span></article><span>→</span><article><small>CUSTOMER</small><strong>{referral.customer}</strong><span>{referral.customerEmail}</span></article></div></section><section><span className="drawer-label">REFERRAL DETAILS</span><dl className="drawer-details"><div><dt>Code</dt><dd>{referral.code}</dd></div><div><dt>Market</dt><dd>{referral.zip}, {referral.state}</dd></div><div><dt>HubSpot deal</dt><dd>#{referral.hubspotDealId}</dd></div><div><dt>HubSpot stage</dt><dd>{referral.hubspotStage}</dd></div><div><dt>Installation</dt><dd>{referral.installedAt ?? "Not completed"}</dd></div><div><dt>Reward</dt><dd>${referral.rewardAmount}</dd></div></dl></section><section><span className="drawer-label">TIMELINE</span><ol className="drawer-timeline"><li className="complete"><i />Referral form submitted<small>{referral.submittedAt}</small></li><li className={referral.status !== "received" ? "complete" : ""}><i />Appointment scheduled<small>{referral.status === "received" ? "Waiting" : "Synced from HubSpot"}</small></li><li className={["installed", "paid"].includes(referral.status) ? "complete" : ""}><i />Installation completed<small>{referral.installedAt ?? "Waiting"}</small></li><li className={referral.status === "paid" ? "complete" : ""}><i />Reward paid<small>{referral.status === "paid" ? "Processed" : "Waiting"}</small></li></ol></section><footer><button className="button button-secondary" type="button">Open in HubSpot</button><button className="button button-secondary" onClick={onMintTrackerLink} type="button">Copy tracker link</button><button className="button button-primary" disabled={!canMarkRewardPaid(referral)} onClick={() => onPay(referral)} type="button">{canMarkRewardPaid(referral) ? `Mark $${referral.rewardAmount} paid` : "Payment locked"}</button></footer></aside></div>; }
