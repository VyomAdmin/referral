import { useEffect, useState } from "react";
import { postJson } from "./api.ts";

type Staff = { id: string; email: string; name: string; role: "Admin" | "Marketing" | "Ops"; twoFactorStatus: string; status: string };
type Referral = { id: string; customerName: string; customerEmail: string; zip: string; state: string; stage: string; referrerId: string; vehicleYear: string; vehicleMake: string; vehicleModel: string; ghlOpportunityId: string | null };
type Reward = { id: string; referralId: string; amount: number | null; status: string; paidAt: string | null; paidBy: string | null };
type Campaign = { offerText: string; rewardAmount: number | null; customerBenefit: string | null; payoutLine: string; active: boolean; templates: { referrerWelcome: { subject: string; body: string }; referralConfirmation: { subject: string; body: string }; installThanks: { subject: string; body: string } } };
type Message = { id: string; channel: string; eventType: string; recipient: string; subject: string; status: string; occurredAt: string };
type Snapshot = { ok: true; me: Staff; referrals: Referral[]; rewards: Reward[]; campaign: Campaign; uncovered: { zip: string; count: number; lastSeen: string }[]; messages: Message[]; audit: { id: string; actor: string; action: string; target: string; time: string }[]; staff: Staff[] };

const sections = ["overview", "referrals", "campaign", "templates", "rewards", "emails", "analytics", "integrations", "settings"] as const;

export function Admin() {
  const params = new URLSearchParams(location.search);
  const inviteToken = params.get("token");
  if (location.pathname.startsWith("/admin/invite") || inviteToken) return <AcceptInvite token={inviteToken ?? ""} />;
  return <Portal initial={params.get("section") ?? "overview"} />;
}

function AcceptInvite({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/invites/accept", { token, password });
    setMessage(body.ok ? "Password set. You can sign in." : body.error ?? "Could not accept the invite.");
  }
  return (
    <section className="panel">
      <h1>Accept invite</h1>
      <form onSubmit={onSubmit}>
        <label className="field"><span>Password</span><input name="password" type="password" required minLength={12} /></label>
        <button type="submit">Set password</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function Portal({ initial }: { initial: string }) {
  const [section, setSection] = useState(initial);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/snapshot", { credentials: "include" });
    if (response.status === 401) {
      setSnapshot(null);
      return;
    }
    const body = (await response.json()) as Snapshot & { error?: string };
    if (!body.ok) {
      setError(body.error ?? "Could not load the portal.");
      return;
    }
    setSnapshot(body);
  }

  useEffect(() => { void load(); }, []);

  if (!snapshot) return <Login onDone={load} />;

  const canEdit = snapshot.me.role === "Admin" || snapshot.me.role === "Marketing";
  const canPay = snapshot.me.role === "Admin" || snapshot.me.role === "Ops";
  return (
    <section className="panel">
      <h1>Staff portal</h1>
      <p>{snapshot.me.name} · {snapshot.me.role} · two-factor {snapshot.me.twoFactorStatus}</p>
      <p>Authenticator-app sign-in exists in Identity Platform. It is not turned on for a project here. Password sign-in still works.</p>
      <div className="row">
        {sections.map((item) => (
          <button type="button" key={item} onClick={() => setSection(item)} aria-pressed={section === item}>{item}</button>
        ))}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {section === "overview" ? <Overview snapshot={snapshot} /> : null}
      {section === "referrals" ? <Referrals rows={snapshot.referrals} /> : null}
      {section === "campaign" ? <CampaignForm campaign={snapshot.campaign} canEdit={canEdit} onSaved={load} /> : null}
      {section === "templates" ? <TemplatesForm campaign={snapshot.campaign} canEdit={canEdit} onSaved={load} /> : null}
      {section === "rewards" ? <Rewards rows={snapshot.rewards} canPay={canPay} onPaid={load} /> : null}
      {section === "emails" ? <Emails rows={snapshot.messages} /> : null}
      {section === "analytics" ? <Analytics rows={snapshot.referrals} /> : null}
      {section === "integrations" ? <Integrations /> : null}
      {section === "settings" ? <Settings me={snapshot.me} people={snapshot.staff} onInvited={load} /> : null}
    </section>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [error, setError] = useState("");
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/admin/login", { email: form.get("email"), password: form.get("password") });
    if (!body.ok) {
      setError(body.error ?? "Sign-in failed.");
      return;
    }
    await onDone();
  }
  return (
    <section className="panel">
      <h1>Staff sign-in</h1>
      <p>Production sign-in is Firebase Authentication. This local server accepts the dev password from the environment.</p>
      <form onSubmit={onSubmit}>
        <label className="field"><span>Email</span><input name="email" type="email" required /></label>
        <label className="field"><span>Password</span><input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}

function Overview({ snapshot }: { snapshot: Snapshot }) {
  const paid = snapshot.rewards.filter((row) => row.status === "paid").length;
  return (
    <div>
      <p>{snapshot.referrals.length} referrals. {snapshot.rewards.length} rewards. {paid} marked paid. {snapshot.uncovered.length} uncovered ZIPs.</p>
      <ul>
        {snapshot.audit.slice(0, 8).map((event) => <li key={event.id}>{event.time} {event.action} {event.target}</li>)}
      </ul>
    </div>
  );
}

function Referrals({ rows }: { rows: Referral[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Referral | null>(null);
  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <label className="field"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <ul>
        {filtered.map((row) => (
          <li key={row.id}><button type="button" onClick={() => setSelected(row)}>{row.customerName} · {row.state} · {row.stage}</button></li>
        ))}
      </ul>
      {selected ? (
        <div className="result">
          <h2>{selected.customerName}</h2>
          <p>{selected.customerEmail}</p>
          <p>ZIP {selected.zip} · {selected.state} · {selected.stage}</p>
          <p>Vehicle {selected.vehicleYear} {selected.vehicleMake} {selected.vehicleModel}</p>
          <p>Referrer {selected.referrerId}</p>
          <p>Opportunity {selected.ghlOpportunityId ?? "not set"}</p>
        </div>
      ) : null}
    </div>
  );
}

function CampaignForm({ campaign, canEdit, onSaved }: { campaign: Campaign; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawAmount = String(form.get("rewardAmount") ?? "").trim();
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/admin/campaign", {
      offerText: form.get("offerText"),
      rewardAmount: rawAmount === "" ? null : Number(rawAmount),
      customerBenefit: String(form.get("customerBenefit") ?? "") || null,
      payoutLine: form.get("payoutLine"),
      active: form.get("active") === "on",
    });
    setMessage(body.ok ? "Saved." : body.error ?? "Could not save.");
    if (body.ok) await onSaved();
  }
  return (
    <form onSubmit={onSubmit}>
      <p>Reward amount: {campaign.rewardAmount === null ? "not set" : campaign.rewardAmount}. Customer benefit: {campaign.customerBenefit ?? "not set"}.</p>
      <label className="field"><span>Offer text</span><input name="offerText" defaultValue={campaign.offerText} disabled={!canEdit} /></label>
      <label className="field"><span>Reward amount</span><input name="rewardAmount" defaultValue={campaign.rewardAmount ?? ""} disabled={!canEdit} /></label>
      <label className="field"><span>Customer benefit</span><input name="customerBenefit" defaultValue={campaign.customerBenefit ?? ""} disabled={!canEdit} /></label>
      <label className="field"><span>Payout line</span><input name="payoutLine" defaultValue={campaign.payoutLine} disabled={!canEdit} /></label>
      <label className="check"><input name="active" type="checkbox" defaultChecked={campaign.active} disabled={!canEdit} /><span>Active</span></label>
      {canEdit ? <button type="submit">Save campaign</button> : <p>Campaign edits need Marketing or Admin.</p>}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

function TemplatesForm({ campaign, canEdit, onSaved }: { campaign: Campaign; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const templates = {
      referrerWelcome: { subject: String(form.get("welcomeSubject") ?? ""), body: String(form.get("welcomeBody") ?? "") },
      referralConfirmation: { subject: String(form.get("confirmSubject") ?? ""), body: String(form.get("confirmBody") ?? "") },
      installThanks: { subject: String(form.get("thanksSubject") ?? ""), body: String(form.get("thanksBody") ?? "") },
    };
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/admin/templates", { templates });
    setMessage(body.ok ? "Saved." : body.error ?? "Could not save.");
    if (body.ok) await onSaved();
  }
  const t = campaign.templates;
  return (
    <form onSubmit={onSubmit}>
      <label className="field"><span>Referrer welcome subject</span><input name="welcomeSubject" defaultValue={t.referrerWelcome.subject} disabled={!canEdit} /></label>
      <label className="field"><span>Referrer welcome body</span><textarea name="welcomeBody" defaultValue={t.referrerWelcome.body} disabled={!canEdit} /></label>
      <label className="field"><span>Customer confirmation subject</span><input name="confirmSubject" defaultValue={t.referralConfirmation.subject} disabled={!canEdit} /></label>
      <label className="field"><span>Customer confirmation body</span><textarea name="confirmBody" defaultValue={t.referralConfirmation.body} disabled={!canEdit} /></label>
      <label className="field"><span>Install thank-you body</span><textarea name="thanksBody" defaultValue={t.installThanks.body} disabled={!canEdit} /></label>
      {canEdit ? <button type="submit">Save templates</button> : <p>Template edits need Marketing or Admin.</p>}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

function Rewards({ rows, canPay, onPaid }: { rows: Reward[]; canPay: boolean; onPaid: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  async function pay(rewardId: string) {
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/admin/rewards/paid", { rewardId });
    setMessage(body.ok ? "Marked paid. No money was moved." : body.error ?? "Could not mark paid.");
    if (body.ok) await onPaid();
  }
  return (
    <div>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.status} · amount {row.amount === null ? "not set" : row.amount}
            {row.status === "eligible" && canPay ? <button type="button" onClick={() => pay(row.id)}>Mark paid</button> : null}
          </li>
        ))}
      </ul>
      {!canPay ? <p>Marking a reward paid needs Ops or Admin.</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

function Emails({ rows }: { rows: Message[] }) {
  const emails = rows.filter((row) => row.channel === "email");
  if (emails.length === 0) return <p>No email events yet. The page lists email events when a verified webhook sends OutboundMessage or LCEmailStats.</p>;
  return (
    <ul>
      {emails.map((row) => <li key={row.id}>{row.occurredAt} {row.eventType} {row.recipient} {row.status} {row.subject}</li>)}
    </ul>
  );
}

function Analytics({ rows }: { rows: Referral[] }) {
  const byStage = new Map<string, number>();
  const byState = new Map<string, number>();
  for (const row of rows) {
    byStage.set(row.stage, (byStage.get(row.stage) ?? 0) + 1);
    byState.set(row.state, (byState.get(row.state) ?? 0) + 1);
  }
  const complete = rows.filter((row) => row.stage === "install_complete").length;
  return (
    <div>
      <p>{rows.length} referrals. {complete} at install complete.</p>
      <p>By stage: {[...byStage.entries()].map(([key, count]) => `${key} ${count}`).join(", ") || "none"}</p>
      <p>By state: {[...byState.entries()].map(([key, count]) => `${key} ${count}`).join(", ") || "none"}</p>
    </div>
  );
}

function Integrations() {
  const [body, setBody] = useState<string>("");
  useEffect(() => {
    fetch("/api/admin/integrations", { credentials: "include" }).then((response) => response.json()).then((payload) => setBody(JSON.stringify(payload, null, 2))).catch(() => setBody("Could not load integration status."));
  }, []);
  return <pre>{body}</pre>;
}

function Settings({ me, people, onInvited }: { me: Staff; people: Staff[]; onInvited: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { body } = await postJson<{ ok?: boolean; error?: string }>("/api/admin/invites", {
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
    });
    setMessage(body.ok ? "Invite email requested." : body.error ?? "Could not send the invite.");
    if (body.ok) await onInvited();
  }
  return (
    <div>
      <ul>{people.map((person) => <li key={person.id}>{person.name} · {person.email} · {person.role} · {person.status} · two-factor {person.twoFactorStatus}</li>)}</ul>
      {me.role === "Admin" ? (
        <form onSubmit={onSubmit}>
          <label className="field"><span>Name</span><input name="name" required /></label>
          <label className="field"><span>Email</span><input name="email" type="email" required /></label>
          <label className="field"><span>Role</span>
            <select name="role" defaultValue="Ops">
              <option>Admin</option>
              <option>Marketing</option>
              <option>Ops</option>
            </select>
          </label>
          <button type="submit">Send invite</button>
        </form>
      ) : <p>Only Admin can send invites.</p>}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
