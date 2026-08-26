"use client";

import { FormEvent, useMemo, useState } from "react";
import { Brand } from "./brand";
import { AddUserForm } from "./add-user-form";
import { TotpEnrollmentForm } from "./totp-enrollment-form";
import { AdminReferral, ReferralStatus } from "../lib/admin-data";
import type { AdminCampaign, AdminEmailEvent, AdminReferrerStats } from "../lib/admin-queries";
import { canMarkRewardPaid, searchReferrals, statusLabel } from "../lib/admin-rules";
import { mintTrackerLinkAction } from "../lib/tracker-actions";
import { markReferralPaidAction, retryHubSpotSyncsAction, updateCampaignAction } from "../lib/admin-actions";
import { ADMIN_ROLES } from "../lib/roles";
import { ThemeToggleIcon } from "./theme-toggle";

type Section = "overview" | "referrals" | "campaigns" | "rewards" | "emails" | "analytics" | "integrations" | "settings";

const sections: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "⌂" },
  { key: "referrals", label: "Referrals & people", icon: "↗" },
  { key: "campaigns", label: "Campaigns & states", icon: "◎" },
  { key: "rewards", label: "Rewards", icon: "$" },
  { key: "emails", label: "Emails", icon: "✉" },
  { key: "analytics", label: "Analytics", icon: "▥" },
  { key: "integrations", label: "Integrations", icon: "⌁" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

const ROLE_DESCRIPTIONS: [string, string][] = [
  ["Owner / Admin", "Full access, settings, integrations, and team permissions."],
  ["CRM Operations", "Customers, referrals, HubSpot sync, and timelines."],
  ["Rewards / Finance", "Eligibility review, payout status, and exports."],
  ["Marketing", "Campaigns, forms, offers, and email templates."],
];

type TeamMember = { id: string; name: string; email: string; role: string; status: string };

const CAMPAIGN_COLORS: Record<string, string> = { AZ: "sun", FL: "ocean" };
function campaignColor(state: string) {
  return CAMPAIGN_COLORS[state] ?? "mountain";
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function AdminDashboard({ currentUser, signOutAction, teamMembers, initialReferrals, initialCampaigns, referrerStats, emailEvents, totpEnabled, totpSecret, totpQrCodeDataUrl }: {
  currentUser: { name: string; role: string };
  signOutAction: () => Promise<void>;
  teamMembers: TeamMember[];
  initialReferrals: AdminReferral[];
  initialCampaigns: AdminCampaign[];
  referrerStats: AdminReferrerStats;
  emailEvents: AdminEmailEvent[];
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
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [editingCampaign, setEditingCampaign] = useState<AdminCampaign | null>(null);
  const [notice, setNotice] = useState("");
  const [retryingSync, setRetryingSync] = useState(false);

  const filteredReferrals = useMemo(() => {
    let matches = searchReferrals(referrals, query);
    if (stateFilter !== "All states") matches = matches.filter((referral) => referral.state === stateFilter);
    if (statusFilter !== "All statuses") matches = matches.filter((referral) => referral.status === statusFilter);
    return matches;
  }, [query, referrals, stateFilter, statusFilter]);

  async function markPaid(referral: AdminReferral) {
    if (!canMarkRewardPaid(referral)) {
      setNotice("Payment is blocked until installation completion is confirmed.");
      return;
    }
    const result = await markReferralPaidAction(referral.id);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setReferrals((current) => current.map((item) => item.id === referral.id ? { ...item, status: "paid" } : item));
    setNotice(`${referral.id} was marked paid and added to the audit log.`);
  }

  async function saveCampaign(updated: AdminCampaign) {
    const result = await updateCampaignAction({ id: updated.id, name: updated.name, offer: updated.offer, rewardCents: updated.rewardCents, active: updated.active });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setCampaigns((current) => current.map((campaign) => (campaign.id === result.campaign.id ? result.campaign : campaign)));
    setEditingCampaign(null);
    setNotice(`${result.campaign.name} was updated.`);
  }

  async function mintTrackerLink() {
    const path = await mintTrackerLinkAction("customer");
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setNotice(`Tracker link copied: ${url}`);
  }

  async function retrySync() {
    setRetryingSync(true);
    const result = await retryHubSpotSyncsAction();
    setRetryingSync(false);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setReferrals(result.referrals);
    setNotice(result.retried === 0 ? "Synced with HubSpot. Nothing needed retrying." : `Synced with HubSpot and retried ${result.retried} pending sync${result.retried === 1 ? "" : "s"}.`);
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
        <div className="admin-sidebar-foot">
          <span className="team-avatar">{initials(currentUser.name)}</span>
          <div><strong>{currentUser.name}</strong><small>{currentUser.role}</small></div>
          <ThemeToggleIcon />
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-breadcrumb">NuVision /</span><strong>{sections.find((item) => item.key === section)?.label}</strong></div>
          <div className="admin-top-actions"><button onClick={() => setSection("settings")} aria-label="Settings" title="Settings" type="button">⚙</button><span className="team-avatar">{initials(currentUser.name)}</span></div>
        </header>

        {notice ? <div className="admin-notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} type="button">×</button></div> : null}

        <div className="admin-workspace">
          {section === "overview" ? <Overview onViewReferrals={() => setSection("referrals")} referrals={referrals} referrerStats={referrerStats} teamMembers={teamMembers} onRetrySync={retrySync} retryingSync={retryingSync} /> : null}
          {section === "referrals" ? (
            <ReferralsView query={query} setQuery={setQuery} stateFilter={stateFilter} setStateFilter={setStateFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} referrals={filteredReferrals} onSelect={setSelected} />
          ) : null}
          {section === "campaigns" ? <CampaignsView campaigns={campaigns} referrals={referrals} onEdit={setEditingCampaign} /> : null}
          {section === "rewards" ? <RewardsView referrals={referrals} onPay={markPaid} /> : null}
          {section === "emails" ? <EmailsView emailEvents={emailEvents} /> : null}
          {section === "analytics" ? <AnalyticsView referrals={referrals} /> : null}
          {section === "integrations" ? <IntegrationsView /> : null}
          {section === "settings" ? (
            <SettingsView currentUserRole={currentUser.role} teamMembers={teamMembers} totpEnabled={totpEnabled} totpSecret={totpSecret} totpQrCodeDataUrl={totpQrCodeDataUrl} signOutAction={signOutAction} />
          ) : null}
        </div>
      </section>

      {selected ? <ReferralDrawer referral={selected} onClose={() => setSelected(null)} onPay={markPaid} onMintTrackerLink={mintTrackerLink} /> : null}
      {editingCampaign ? <CampaignEditDrawer campaign={editingCampaign} onClose={() => setEditingCampaign(null)} onSave={saveCampaign} /> : null}
    </main>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="admin-page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}

const PAGE_SIZE = 10;

function Pagination({ page, totalItems, pageSize, onPageChange }: { page: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  return (
    <div className="admin-pagination">
      <span>{start}–{end} of {totalItems}</span>
      <div className="admin-pagination-controls">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} type="button">‹ Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} type="button">Next ›</button>
      </div>
    </div>
  );
}

function Overview({ onViewReferrals, referrals, referrerStats, teamMembers, onRetrySync, retryingSync }: { onViewReferrals: () => void; referrals: AdminReferral[]; referrerStats: AdminReferrerStats; teamMembers: TeamMember[]; onRetrySync: () => void; retryingSync: boolean }) {
  const today = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), []);
  const [now] = useState(() => Date.now());

  const stats = useMemo(() => {
    const formsSubmitted = referrals.length;
    const appointments = referrals.filter((r) => ["scheduled", "installed", "paid"].includes(r.status)).length;
    const installed = referrals.filter((r) => ["installed", "paid"].includes(r.status)).length;
    const paid = referrals.filter((r) => r.status === "paid").length;
    const outstanding = referrals.filter((r) => r.status === "installed");
    const outstandingAmount = outstanding.reduce((sum, r) => sum + r.rewardAmount, 0);
    const paidAllTime = referrals.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.rewardAmount, 0);
    const syncIssues = referrals.filter((r) => r.syncStatus !== "synced");
    const pendingInvitations = teamMembers.filter((m) => m.status === "invited").length;
    const formToInstallRate = formsSubmitted ? Math.round((installed / formsSubmitted) * 1000) / 10 : 0;
    const oldestOutstandingDays = outstanding.length
      ? Math.max(0, Math.floor((now - Math.min(...outstanding.map((r) => new Date(r.submittedAt).getTime()))) / 86400000))
      : 0;
    return { formsSubmitted, appointments, installed, paid, outstanding, outstandingAmount, paidAllTime, syncIssues, pendingInvitations, formToInstallRate, oldestOutstandingDays };
  }, [referrals, teamMembers, now]);

  const funnel = [
    { label: "Forms submitted", value: stats.formsSubmitted },
    { label: "Appointments", value: stats.appointments },
    { label: "Installations", value: stats.installed },
    { label: "Rewards paid", value: stats.paid },
  ];
  const funnelMax = stats.formsSubmitted || 1;

  const attentionItems = [
    stats.outstanding.length > 0 ? { key: "rewards", icon: "warning-icon", iconLabel: "$", title: `${stats.outstanding.length} reward${stats.outstanding.length === 1 ? "" : "s"} await payment`, detail: `Oldest eligible for ${stats.oldestOutstandingDays} day${stats.oldestOutstandingDays === 1 ? "" : "s"}`, action: "Review" } : null,
    stats.syncIssues.length > 0 ? { key: "sync", icon: "sync-icon", iconLabel: "↻", title: `${stats.syncIssues.length} HubSpot sync${stats.syncIssues.length === 1 ? "" : "s"} pending`, detail: stats.syncIssues[0]?.id ?? "", action: retryingSync ? "Retrying…" : "Retry", onAction: onRetrySync, disabled: retryingSync } : null,
    stats.pendingInvitations > 0 ? { key: "invites", icon: "team-icon", iconLabel: String(stats.pendingInvitations), title: `${stats.pendingInvitations} teammate invitation${stats.pendingInvitations === 1 ? "" : "s"}`, detail: "Waiting for acceptance", action: "View" } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return <>
    <PageTitle eyebrow={today} title="Referral operations" description="A clear view from first share to final reward." />
    <div className="admin-metric-grid">
      <article><span>Active referrers</span><strong>{referrerStats.total}</strong><p>{referrerStats.joinedThisMonth} joined this month</p></article>
      <article><span>Referral forms</span><strong>{stats.formsSubmitted}</strong><p>{stats.installed} installation-qualified</p></article>
      <article><span>Installed</span><strong>{stats.installed}</strong><p>{stats.formToInstallRate}% form-to-install</p></article>
      <article className="admin-metric-money"><span>Rewards outstanding</span><strong>${stats.outstandingAmount}</strong><p>${stats.paidAllTime} paid all time</p></article>
    </div>
    <div className="overview-grid">
      <section className="admin-card performance-card"><div className="admin-card-head"><div><span>PERFORMANCE</span><h2>Referral funnel</h2></div></div><div className="funnel-bars">
        {funnel.map((bar) => <div key={bar.label}><span>{bar.label}</span><div><i style={{ width: `${Math.round((bar.value / funnelMax) * 100)}%` }} /></div><strong>{bar.value}</strong></div>)}
      </div><button className="text-button" onClick={onViewReferrals} type="button">View all referrals →</button></section>
      <section className="admin-card activity-card"><div className="admin-card-head"><div><span>LIVE ACTIVITY</span><h2>Needs attention</h2></div><span className="alert-count">{attentionItems.length}</span></div>
        {attentionItems.length === 0 ? <p className="empty-table">Nothing needs attention right now.</p> : attentionItems.map((item) => (
          <article key={item.key}><span className={`attention-icon ${item.icon}`}>{item.iconLabel}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><button onClick={"onAction" in item ? item.onAction : undefined} disabled={"disabled" in item ? item.disabled : false} type="button">{item.action}</button></article>
        ))}
        <button className="text-button" onClick={onRetrySync} disabled={retryingSync} type="button">{retryingSync ? "Syncing with HubSpot…" : "Sync with HubSpot"}</button>
      </section>
    </div>
    <div className="admin-card recent-card"><div className="admin-card-head"><div><span>LATEST REFERRALS</span><h2>Recent activity</h2></div><button className="text-button" onClick={onViewReferrals} type="button">See all →</button></div><ReferralTable referrals={referrals.slice(0, 4)} />{referrals.length === 0 ? <p className="empty-table"><strong>No referrals yet</strong></p> : null}</div>
  </>;
}

function ReferralsView({ query, setQuery, stateFilter, setStateFilter, statusFilter, setStatusFilter, referrals, onSelect }: { query: string; setQuery: (value: string) => void; stateFilter: string; setStateFilter: (value: string) => void; statusFilter: "All statuses" | ReferralStatus; setStatusFilter: (value: "All statuses" | ReferralStatus) => void; referrals: AdminReferral[]; onSelect: (referral: AdminReferral) => void }) {
  const [page, setPage] = useState(1);
  const filterKey = `${query}|${stateFilter}|${statusFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }
  const pageReferrals = useMemo(() => referrals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [referrals, page]);

  return <><PageTitle eyebrow="CRM OPERATIONS" title="Referrals & people" description="Search any referrer or referred customer across campaigns and HubSpot." /><div className="table-toolbar"><label className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, code, HubSpot ID…" /></label><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>All states</option><option>AZ</option><option>FL</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All statuses" | ReferralStatus)}><option>All statuses</option><option value="received">{statusLabel("received")}</option><option value="scheduled">{statusLabel("scheduled")}</option><option value="installed">{statusLabel("installed")}</option><option value="paid">{statusLabel("paid")}</option><option value="cancelled">{statusLabel("cancelled")}</option></select></div><div className="admin-card referral-table-card"><ReferralTable referrals={pageReferrals} onSelect={onSelect} />{referrals.length === 0 ? <div className="empty-table"><strong>No matching referrals</strong><span>Try a different name, phone, code, or filter.</span></div> : <Pagination page={page} totalItems={referrals.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}</div></>;
}

function ReferralTable({ referrals, onSelect }: { referrals: AdminReferral[]; onSelect?: (referral: AdminReferral) => void }) {
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Referral</th><th>Referrer</th><th>Customer</th><th>Market</th><th>Status</th><th>HubSpot</th><th /></tr></thead><tbody>{referrals.map((referral) => <tr key={referral.id} onClick={() => onSelect?.(referral)} className={onSelect ? "clickable-row" : ""}><td><strong>{referral.id}</strong><small>{referral.submittedAt}</small></td><td><strong>{referral.referrer}</strong><small>{referral.referrerEmail}</small></td><td><strong>{referral.customer}</strong><small>{referral.phone}</small></td><td><span className={`market-tag market-${referral.state.toLowerCase()}`}>{referral.state}</span><small>{referral.zip}</small></td><td><span className={`admin-status status-${referral.status}`}>{statusLabel(referral.status)}</span></td><td><strong className="hubspot-id">#{referral.hubspotDealId}</strong><small className={`sync-${referral.syncStatus}`}>{referral.syncStatus}</small></td><td><button aria-label={`Open ${referral.id}`} type="button">›</button></td></tr>)}</tbody></table></div>;
}

function CampaignsView({ campaigns, referrals, onEdit }: { campaigns: AdminCampaign[]; referrals: AdminReferral[]; onEdit: (campaign: AdminCampaign) => void }) {
  const leadsByState = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const referral of referrals) counts[referral.state] = (counts[referral.state] ?? 0) + 1;
    return counts;
  }, [referrals]);

  return <><PageTitle eyebrow="STATE ROUTING" title="Campaigns & offers" description="One referral link automatically selects the correct state experience." /><div className="campaign-admin-grid">{campaigns.map((campaign) => <article className="campaign-admin-card" key={campaign.id}><div className={`campaign-state campaign-${campaignColor(campaign.state)}`}>{campaign.state}</div><div className="campaign-active-row"><span className={campaign.active ? "active-dot" : "paused-dot"}>{campaign.active ? "Active" : "Paused"}</span><button onClick={() => onEdit(campaign)} type="button">•••</button></div><h2>{campaign.name}</h2><p>{campaign.offer ?? "No customer offer"}</p><dl><div><dt>Referrer</dt><dd>${(campaign.rewardCents / 100).toFixed(0)} reward</dd></div><div><dt>Forms submitted</dt><dd>{leadsByState[campaign.state] ?? 0}</dd></div><div><dt>ZIP routing</dt><dd>Configured</dd></div></dl><button className="campaign-edit" onClick={() => onEdit(campaign)} type="button">Edit campaign</button></article>)}</div></>;
}

function CampaignEditDrawer({ campaign, onClose, onSave }: { campaign: AdminCampaign; onClose: () => void; onSave: (campaign: AdminCampaign) => void }) {
  const [name, setName] = useState(campaign.name);
  const [offer, setOffer] = useState(campaign.offer ?? "");
  const [rewardDollars, setRewardDollars] = useState(String(campaign.rewardCents / 100));
  const [active, setActive] = useState(campaign.active);

  function submit(event: FormEvent) {
    event.preventDefault();
    const rewardCents = Math.round(Number(rewardDollars) * 100);
    onSave({ ...campaign, name, offer: offer.trim() || null, rewardCents: Number.isFinite(rewardCents) ? rewardCents : campaign.rewardCents, active });
  }

  return (
    <div className="drawer-backdrop">
      <button className="drawer-close-backdrop" onClick={onClose} aria-label="Close campaign editor" type="button" />
      <aside className="referral-drawer">
        <header><div><span>{campaign.state}</span><h2>Edit campaign</h2></div><button onClick={onClose} type="button">×</button></header>
        <form className="settings-panel-card admin-card" onSubmit={submit}>
          <label>Campaign name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Customer offer<input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="No customer offer" /></label>
          <label>Referrer reward ($)<input value={rewardDollars} onChange={(event) => setRewardDollars(event.target.value)} type="number" min="0" step="1" required /></label>
          <label className="consent-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> <span>Campaign is active</span></label>
          <footer><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" type="submit">Save changes</button></footer>
        </form>
      </aside>
    </div>
  );
}

type RewardStatusFilter = "All statuses" | "scheduled" | "installed" | "paid";

function RewardsView({ referrals, onPay }: { referrals: AdminReferral[]; onPay: (referral: AdminReferral) => void }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RewardStatusFilter>("All statuses");
  const [page, setPage] = useState(1);

  const eligibleNow = referrals.filter((r) => r.status === "installed").reduce((sum, r) => sum + r.rewardAmount, 0);
  const paidAllTime = referrals.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.rewardAmount, 0);
  const blocked = referrals.filter((r) => r.status === "received" || r.status === "scheduled").reduce((sum, r) => sum + r.rewardAmount, 0);

  const rewardQueue = useMemo(() => referrals.filter((referral) => ["scheduled", "installed", "paid"].includes(referral.status)), [referrals]);
  const filteredQueue = useMemo(() => {
    let matches = searchReferrals(rewardQueue, query);
    if (statusFilter !== "All statuses") matches = matches.filter((referral) => referral.status === statusFilter);
    return matches;
  }, [rewardQueue, query, statusFilter]);

  const filterKey = `${query}|${statusFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }
  const pageQueue = useMemo(() => filteredQueue.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredQueue, page]);

  return <><PageTitle eyebrow="FINANCE" title="Reward queue" description="Payments unlock only after an installation-completed signal." /><div className="reward-summary"><article><span>Eligible now</span><strong>${eligibleNow}</strong></article><article><span>Paid all time</span><strong>${paidAllTime}</strong></article><article><span>Blocked / pending install</span><strong>${blocked}</strong></article></div><div className="table-toolbar"><label className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, code, HubSpot ID…" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RewardStatusFilter)}><option value="All statuses">All statuses</option><option value="scheduled">{statusLabel("scheduled")}</option><option value="installed">{statusLabel("installed")}</option><option value="paid">{statusLabel("paid")}</option></select></div><div className="admin-card reward-table"><ReferralTable referrals={pageQueue} />{filteredQueue.length === 0 ? <div className="empty-table"><strong>No matching referrals</strong><span>Try a different name, phone, code, or filter.</span></div> : <Pagination page={page} totalItems={filteredQueue.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}<div className="reward-actions">{pageQueue.filter((referral) => ["scheduled", "installed"].includes(referral.status)).map((referral) => <div key={referral.id}><span><strong>{referral.id}</strong> • {referral.customer}</span><button disabled={!canMarkRewardPaid(referral)} onClick={() => onPay(referral)} type="button">{canMarkRewardPaid(referral) ? `Mark $${referral.rewardAmount} paid` : "Waiting for installation"}</button></div>)}</div></div></>;
}

function EmailsView({ emailEvents }: { emailEvents: AdminEmailEvent[] }) {
  const total = emailEvents.length;
  const delivered = emailEvents.filter((e) => ["delivered", "opened", "clicked"].includes(e.status)).length;
  const opened = emailEvents.filter((e) => ["opened", "clicked"].includes(e.status)).length;
  const clicked = emailEvents.filter((e) => e.status === "clicked").length;
  const bounced = emailEvents.filter((e) => e.status === "bounced").length;
  const pct = (count: number) => total ? `${Math.round((count / total) * 1000) / 10}%` : "—";

  return <><PageTitle eyebrow="COMMUNICATIONS" title="Email activity" description="Referral-specific transactional emails, delivery, and tracker clicks." /><div className="admin-metric-grid email-metrics"><article><span>Delivered</span><strong>{delivered}</strong><p>{pct(delivered)} of sent</p></article><article><span>Opened</span><strong>{opened}</strong><p>{pct(opened)} of sent</p></article><article><span>Tracker clicks</span><strong>{clicked}</strong><p>{pct(clicked)} of sent</p></article><article><span>Bounced</span><strong>{bounced}</strong><p>{pct(bounced)} of sent</p></article></div><div className="admin-card"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Recipient</th><th>Template</th><th>Referral</th><th>Status</th><th>Sent</th></tr></thead><tbody>{emailEvents.map((email) => <tr key={email.id}><td><strong>{email.recipient}</strong></td><td>{email.templateKey}</td><td>{email.referralId ? <span className="hubspot-id">{email.referralId}</span> : "—"}</td><td><span className="admin-status status-installed">{email.status}</span></td><td>{new Date(email.sentAt).toLocaleString()}</td></tr>)}</tbody></table></div>{emailEvents.length === 0 ? <p className="empty-table"><strong>No email activity yet</strong><span>Connect a transactional email provider to start sending.</span></p> : null}</div></>;
}

function AnalyticsView({ referrals }: { referrals: AdminReferral[] }) {
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = new Map<string, { forms: number; installed: number }>();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      keys.push(key);
      buckets.set(key, { forms: 0, installed: 0 });
    }
    referrals.forEach((referral) => {
      const submitted = new Date(referral.submittedAt);
      const key = `${submitted.getFullYear()}-${submitted.getMonth()}`;
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.forms += 1;
      if (referral.status === "installed" || referral.status === "paid") bucket.installed += 1;
    });
    const max = Math.max(1, ...keys.map((key) => buckets.get(key)?.forms ?? 0));
    return keys.map((key) => {
      const [year, month] = key.split("-").map(Number);
      const bucket = buckets.get(key)!;
      return {
        label: new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" }),
        forms: bucket.forms,
        installed: bucket.installed,
        formsHeight: Math.round((bucket.forms / max) * 100),
        installedHeight: Math.round((bucket.installed / max) * 100),
      };
    });
  }, [referrals]);

  const marketBreakdown = useMemo(() => {
    const byState = new Map<string, { total: number; installed: number }>();
    referrals.forEach((referral) => {
      const entry = byState.get(referral.state) ?? { total: 0, installed: 0 };
      entry.total += 1;
      if (referral.status === "installed" || referral.status === "paid") entry.installed += 1;
      byState.set(referral.state, entry);
    });
    return Array.from(byState.entries()).map(([state, { total, installed }]) => ({ state, rate: total ? Math.round((installed / total) * 100) : 0 }));
  }, [referrals]);

  return <><PageTitle eyebrow="PERFORMANCE" title="Referral analytics" description="Understand volume, conversion, markets, and reward efficiency." /><div className="analytics-grid"><section className="admin-card"><div className="admin-card-head"><div><span>MONTHLY VOLUME</span><h2>Forms and installations</h2></div></div><div className="bar-chart">{monthly.map((bar) => <div key={bar.label}><i style={{ height: `${bar.formsHeight}%` }} /><b style={{ height: `${bar.installedHeight}%` }} /><span>{bar.label}</span></div>)}</div></section><section className="admin-card market-performance"><div className="admin-card-head"><div><span>BY MARKET</span><h2>Installation conversion</h2></div></div>{marketBreakdown.length === 0 ? <p className="empty-table">No referrals yet.</p> : marketBreakdown.map(({ state, rate }) => <div key={state}><span>{state}</span><div><i style={{ width: `${rate}%` }} /></div><strong>{rate}%</strong></div>)}</section></div></>;
}

function IntegrationsView() { return <><PageTitle eyebrow="SYSTEM HEALTH" title="Integrations" description="Test mappings and workflows before your developers connect production services." /><div className="integration-grid"><article className="admin-card integration-card"><div className="integration-logo hubspot-logo">H</div><div><span className="paused-dot">Simulated</span><h2>HubSpot CRM</h2><p>Contacts, deals, stage changes, and installation completion use seeded test events.</p></div><dl><div><dt>CRM writes</dt><dd>Disabled</dd></div><div><dt>Webhook endpoint</dt><dd>Awaiting secret</dd></div><div><dt>Test mapping</dt><dd>15 checks passed</dd></div></dl></article><article className="admin-card integration-card"><div className="integration-logo email-logo">@</div><div><span className="paused-dot">Simulated</span><h2>Transactional email</h2><p>Templates and event previews are active. No messages leave the application.</p></div><dl><div><dt>Live sending</dt><dd>Disabled</dd></div><div><dt>Templates</dt><dd>6 configured</dd></div><div><dt>Provider</dt><dd>Choose before launch</dd></div></dl></article></div></>; }

function SettingsView({ currentUserRole, teamMembers, totpEnabled, totpSecret, totpQrCodeDataUrl, signOutAction }: {
  currentUserRole: string;
  teamMembers: TeamMember[];
  totpEnabled: boolean;
  totpSecret: string;
  totpQrCodeDataUrl: string;
  signOutAction: () => Promise<void>;
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
        <h2 className="settings-subheading">Roles</h2>
        <div className="role-grid">{ROLE_DESCRIPTIONS.map(([role, copy]) => <article className="admin-card" key={role}><strong>{role}</strong><p>{copy}</p></article>)}</div>
      </>
    ) : null}
    {tab === "security" ? (
      <>
        <h2 className="settings-subheading">Two-factor authentication</h2>
        <div className="admin-card settings-panel-card">
          {totpEnabled ? <p>Two-factor authentication is enabled on your account.</p> : <TotpEnrollmentForm secret={totpSecret} qrCodeDataUrl={totpQrCodeDataUrl} />}
        </div>
        <h2 className="settings-subheading">Session</h2>
        <div className="admin-card settings-panel-card">
          <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
        </div>
      </>
    ) : null}
  </>;
}

function ReferralDrawer({ referral, onClose, onPay, onMintTrackerLink }: { referral: AdminReferral; onClose: () => void; onPay: (referral: AdminReferral) => void; onMintTrackerLink: () => void }) { return <div className="drawer-backdrop"><button className="drawer-close-backdrop" onClick={onClose} aria-label="Close referral details" type="button" /><aside className="referral-drawer"><header><div><span>{referral.id}</span><h2>{referral.customer}</h2></div><button onClick={onClose} type="button">×</button></header><div className="drawer-status"><span className={`admin-status status-${referral.status}`}>{statusLabel(referral.status)}</span><span className={`sync-${referral.syncStatus}`}>HubSpot {referral.syncStatus}</span></div><section><span className="drawer-label">PEOPLE</span><div className="person-pair"><article><small>REFERRER</small><strong>{referral.referrer}</strong><span>{referral.referrerEmail}</span></article><span>→</span><article><small>CUSTOMER</small><strong>{referral.customer}</strong><span>{referral.customerEmail}</span></article></div></section><section><span className="drawer-label">REFERRAL DETAILS</span><dl className="drawer-details"><div><dt>Code</dt><dd>{referral.code}</dd></div><div><dt>Market</dt><dd>{referral.zip}, {referral.state}</dd></div><div><dt>HubSpot deal</dt><dd>#{referral.hubspotDealId}</dd></div><div><dt>HubSpot stage</dt><dd>{referral.hubspotStage}</dd></div><div><dt>Installation</dt><dd>{referral.installedAt ?? "Not completed"}</dd></div><div><dt>Reward</dt><dd>${referral.rewardAmount}</dd></div></dl></section><section><span className="drawer-label">TIMELINE</span><ol className="drawer-timeline"><li className="complete"><i />Referral form submitted<small>{referral.submittedAt}</small></li><li className={referral.status !== "received" ? "complete" : ""}><i />Appointment scheduled<small>{referral.status === "received" ? "Waiting" : "Synced from HubSpot"}</small></li><li className={["installed", "paid"].includes(referral.status) ? "complete" : ""}><i />Installation completed<small>{referral.installedAt ?? "Waiting"}</small></li><li className={referral.status === "paid" ? "complete" : ""}><i />Reward paid<small>{referral.status === "paid" ? "Processed" : "Waiting"}</small></li></ol></section><footer><button className="button button-secondary" onClick={onMintTrackerLink} type="button">Copy tracker link</button><button className="button button-primary" disabled={!canMarkRewardPaid(referral)} onClick={() => onPay(referral)} type="button">{canMarkRewardPaid(referral) ? `Mark $${referral.rewardAmount} paid` : "Payment locked"}</button></footer></aside></div>; }
