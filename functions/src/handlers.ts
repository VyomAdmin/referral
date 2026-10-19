import { displayOrNotSet, publicSiteConfig, type SiteConfig } from "../../config/site.ts";
import {
  botCheck,
  canEditCampaign,
  canInviteStaff,
  canMarkRewardPaid,
  customerCopyMentionsMoney,
  isSelfReferral,
  isValidEmail,
  isValidPhone,
  isZip,
  newReferralCode,
  newSecret,
  parseCoverageCsv,
  phoneDigits,
  resolveStage,
  ROLES,
  sha256,
  shouldCreateReward,
  STAGE_LABELS,
  verifyEd25519Signature,
  webhookEventId,
  type StaffRole,
  type Stage,
} from "./domain.ts";
import { NotConfiguredError, type Crm, type Messaging } from "./ghl.ts";
import { emptyTemplates, type Campaign, type Referral, type Staff, type Store } from "./store.ts";

export type Deps = {
  store: Store;
  crm: Crm;
  messaging: Messaging;
  config: SiteConfig;
  now: () => string;
  nowMs: () => number;
  id: () => string;
  appCheckRequired: boolean;
  verifyAppCheck: (token: string | undefined) => Promise<boolean>;
  createUser: (email: string, password: string) => Promise<{ uid: string }>;
};

export type Actor = { id: string; email: string };

type Fail = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

async function campaignOf(deps: Deps): Promise<Campaign> {
  const stored = await deps.store.getCampaign();
  if (stored) return stored;
  return {
    offerText: deps.config.offerText,
    rewardAmount: deps.config.rewardAmount,
    customerBenefit: deps.config.customerBenefit,
    payoutLine: deps.config.payoutLine,
    active: false,
    templates: emptyTemplates(),
  };
}

function referralLink(config: SiteConfig, code: string): string {
  const path = `/r/${encodeURIComponent(code)}`;
  return config.domain ? `https://${config.domain}${path}` : path;
}

export async function getPublicConfig(deps: Deps, includeReward = false) {
  const campaign = await campaignOf(deps);
  const base = publicSiteConfig(deps.config);
  return {
    legalName: base.legalName,
    brandName: base.brandName,
    domain: base.domain,
    offerText: displayOrNotSet(campaign.offerText),
    customerBenefit: displayOrNotSet(campaign.customerBenefit),
    smsConsentText: base.smsConsentText,
    privacyText: base.privacyText,
    termsText: base.termsText,
    states: base.states,
    active: campaign.active,
    ...(includeReward ? { rewardAmount: displayOrNotSet(campaign.rewardAmount), payoutLine: displayOrNotSet(campaign.payoutLine) } : {}),
  };
}

export async function signup(deps: Deps, input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  consent?: boolean;
  smsConsent?: boolean;
  honeypot?: string;
  startedAt?: number;
  ip?: string;
}): Promise<Ok<{ code: string; link: string; existing: boolean; rewardAmount: string; payoutLine: string }> | Fail> {
  const blocked = botCheck({ honeypot: input.honeypot, startedAt: input.startedAt, nowMs: deps.nowMs() });
  if (blocked) return { ok: false, error: blocked };
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = phoneDigits(input.phone ?? "");
  if (!firstName || !lastName || !isValidEmail(email) || !isValidPhone(phone)) {
    return { ok: false, error: "Please complete every field with a valid email and a 10-digit mobile number." };
  }
  if (!input.consent || !input.smsConsent) {
    return { ok: false, error: "Consent to the program terms and to text messages is required." };
  }
  const allowed = await deps.store.takeRateLimit(`signup:${input.ip ?? "unknown"}`, deps.config.signupLimit, deps.config.signupWindowMinutes * 60_000, deps.nowMs());
  if (!allowed) return { ok: false, error: "Too many signups from this connection. Please try again later." };

  const existing = await deps.store.findReferrerByEmail(email);
  const configView = await getPublicConfig(deps, true);
  if (existing) {
    return { ok: true, code: existing.referralCode, link: referralLink(deps.config, existing.referralCode), existing: true, rewardAmount: configView.rewardAmount, payoutLine: configView.payoutLine };
  }

  const now = deps.now();
  const row = {
    id: deps.id(),
    name: fullName(firstName, lastName),
    firstName,
    lastName,
    email,
    phone,
    referralCode: newReferralCode(),
    consentText: deps.config.termsText,
    consentAt: now,
    smsConsentText: deps.config.smsConsentText,
    smsConsentAt: now,
    ghlContactId: null,
    syncPending: true,
    createdAt: now,
  };
  await deps.store.insertReferrer(row);
  await syncReferrer(deps, row.id);
  return { ok: true, code: row.referralCode, link: referralLink(deps.config, row.referralCode), existing: false, rewardAmount: configView.rewardAmount, payoutLine: configView.payoutLine };
}

async function syncReferrer(deps: Deps, id: string) {
  const referrer = await deps.store.getReferrer(id);
  if (!referrer) return;
  try {
    const result = await deps.crm.upsertContact({
      firstName: referrer.firstName,
      lastName: referrer.lastName,
      email: referrer.email,
      phone: referrer.phone,
      tags: ["referrer"],
      customFields: { referralCode: referrer.referralCode, referrerId: referrer.id },
    });
    await deps.store.updateReferrer(id, { ghlContactId: result.contactId, syncPending: false });
  } catch (error) {
    if (!(error instanceof NotConfiguredError) && !(error instanceof Error)) return;
    await deps.store.updateReferrer(id, { syncPending: true });
  }
}

export async function quote(deps: Deps, input: {
  referralCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  zip?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  consent?: boolean;
  smsConsent?: boolean;
  honeypot?: string;
  startedAt?: number;
  ip?: string;
}): Promise<Ok<{ referralId: string; trackToken: string }> | Fail> {
  const blocked = botCheck({ honeypot: input.honeypot, startedAt: input.startedAt, nowMs: deps.nowMs() });
  if (blocked) return { ok: false, error: blocked };
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = phoneDigits(input.phone ?? "");
  const zip = (input.zip ?? "").trim();
  if (!firstName || !lastName || !isValidEmail(email) || !isValidPhone(phone)) {
    return { ok: false, error: "Complete every field, including a valid email and a 10-digit mobile number." };
  }
  if (!input.consent || !input.smsConsent) return { ok: false, error: "Please agree to the program terms and the text-message disclosure." };
  if (!isZip(zip)) return { ok: false, error: "Enter a valid five-digit ZIP code." };
  const year = (input.vehicleYear ?? "").trim();
  if (year && !/^\d{4}$/.test(year)) return { ok: false, error: "Enter a valid vehicle year." };

  const allowed = await deps.store.takeRateLimit(`quote:${input.ip ?? "unknown"}`, deps.config.quoteLimit, deps.config.quoteWindowMinutes * 60_000, deps.nowMs());
  if (!allowed) return { ok: false, error: "Too many submissions from this connection. Please try again later." };

  const campaign = await campaignOf(deps);
  if (!campaign.active) return { ok: false, error: "This referral program is not active." };

  const coverage = await deps.store.getCoverage(zip);
  if (!coverage) {
    await deps.store.noteUncoveredZip(zip, deps.now());
    return { ok: false, error: "We don't yet support service in this area." };
  }

  const referrer = await deps.store.findReferrerByCode((input.referralCode ?? "").trim());
  if (!referrer) return { ok: false, error: "This referral link is no longer valid." };
  if (isSelfReferral(referrer, { email, phone })) {
    return { ok: false, error: "This is your own referral link. Share it with someone else." };
  }

  const now = deps.now();
  const token = newSecret();
  const referral: Referral = {
    id: deps.id(),
    referrerId: referrer.id,
    customerName: fullName(firstName, lastName),
    customerFirstName: firstName,
    customerLastName: lastName,
    customerEmail: email,
    customerPhone: phone,
    consentText: deps.config.termsText,
    consentAt: now,
    smsConsentText: deps.config.smsConsentText,
    smsConsentAt: now,
    vehicleYear: year,
    vehicleMake: (input.vehicleMake ?? "").trim(),
    vehicleModel: (input.vehicleModel ?? "").trim(),
    zip,
    state: coverage.state,
    stage: "new_referral",
    installCompletedAt: null,
    ghlContactId: null,
    ghlOpportunityId: null,
    trackingTokenHash: sha256(token),
    syncPending: true,
    syncError: null,
    createdAt: now,
  };
  await deps.store.insertReferral(referral);
  await syncReferral(deps, referral.id);
  return { ok: true, referralId: referral.id, trackToken: token };
}

async function syncReferral(deps: Deps, id: string) {
  const referral = await deps.store.getReferral(id);
  if (!referral) return;
  const referrer = await deps.store.getReferrer(referral.referrerId);
  try {
    const contact = await deps.crm.upsertContact({
      firstName: referral.customerFirstName,
      lastName: referral.customerLastName,
      email: referral.customerEmail,
      phone: referral.customerPhone,
      tags: ["referred"],
      customFields: {
        referralCode: referrer?.referralCode ?? "",
        referralId: referral.id,
        referrerId: referral.referrerId,
        state: referral.state,
        zip: referral.zip,
        vehicle: [referral.vehicleYear, referral.vehicleMake, referral.vehicleModel].filter(Boolean).join(" "),
      },
    });
    const opportunity = await deps.crm.createOpportunity({
      contactId: contact.contactId,
      name: referral.customerName,
      stage: referral.stage,
    });
    await deps.store.updateReferral(id, { ghlContactId: contact.contactId, ghlOpportunityId: opportunity.opportunityId, syncPending: false, syncError: null });
  } catch (error) {
    const message = error instanceof NotConfiguredError ? "CRM is not configured." : "CRM sync failed.";
    await deps.store.updateReferral(id, { syncPending: true, syncError: message });
  }
}

export async function trackReferrer(deps: Deps, input: { email?: string; phone?: string }) {
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = phoneDigits(input.phone ?? "");
  if (!isValidEmail(email) || !isValidPhone(phone)) return { ok: false as const, error: "Enter the email and mobile number you signed up with." };
  const referrer = await deps.store.findReferrerByEmailAndPhone(email, phone);
  if (!referrer) return { ok: false as const, error: "No referrer matched that email and mobile number." };
  const referrals = await deps.store.listReferralsByReferrer(referrer.id);
  const rewards = await deps.store.listRewards();
  const mine = rewards.filter((reward) => reward.referrerId === referrer.id);
  return {
    ok: true as const,
    code: referrer.referralCode,
    link: referralLink(deps.config, referrer.referralCode),
    totals: {
      referrals: referrals.length,
      installComplete: referrals.filter((row) => row.stage === "install_complete").length,
      rewardsEligible: mine.filter((reward) => reward.status === "eligible").length,
      rewardsPaid: mine.filter((reward) => reward.status === "paid").length,
    },
    referrals: referrals.map((row) => ({
      id: row.id,
      customerFirstName: row.customerFirstName,
      state: row.state,
      stage: STAGE_LABELS[row.stage],
      rewardStatus: mine.find((reward) => reward.referralId === row.id)?.status ?? "none",
    })),
  };
}

export async function trackCustomer(deps: Deps, input: { token?: string }) {
  const token = (input.token ?? "").trim();
  if (!token) return { ok: false as const, error: "Enter the tracking link token." };
  const referral = await deps.store.findReferralByTokenHash(sha256(token));
  if (!referral) return { ok: false as const, error: "This tracking link is not valid." };
  return {
    ok: true as const,
    stage: STAGE_LABELS[referral.stage],
    state: referral.state,
    zip: referral.zip,
  };
}

async function maybeCreateReward(deps: Deps, referralId: string) {
  const referral = await deps.store.getReferral(referralId);
  if (!referral) return;
  const referrer = await deps.store.getReferrer(referral.referrerId);
  const existing = await deps.store.findRewardByReferral(referral.id);
  const selfReferral = referrer ? isSelfReferral(referrer, { email: referral.customerEmail, phone: referral.customerPhone }) : false;
  if (!shouldCreateReward({ stage: referral.stage, selfReferral, rewardExists: Boolean(existing) })) return;
  const campaign = await campaignOf(deps);
  await deps.store.insertReward({
    id: deps.id(),
    referralId: referral.id,
    referrerId: referral.referrerId,
    amount: campaign.rewardAmount,
    status: "eligible",
    paidAt: null,
    paidBy: null,
    createdAt: deps.now(),
  });
}

export async function applyStage(deps: Deps, opportunityId: string, stage: Stage, when: string) {
  const referral = await deps.store.findReferralByOpportunity(opportunityId);
  if (!referral) return { updated: false as const };
  const patch: Partial<Referral> = { stage };
  if (stage === "install_complete" && !referral.installCompletedAt) patch.installCompletedAt = when;
  await deps.store.updateReferral(referral.id, patch);
  await maybeCreateReward(deps, referral.id);
  return { updated: true as const, referralId: referral.id };
}

export async function markRewardPaid(deps: Deps, actor: Actor, rewardId: string): Promise<Ok<{ rewardId: string }> | Fail> {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active" || !canMarkRewardPaid(staff.role)) {
    return { ok: false, error: "You don't have permission to mark a reward paid." };
  }
  const reward = await deps.store.getReward(rewardId);
  if (!reward) return { ok: false, error: "Reward not found." };
  if (reward.status === "paid") return { ok: false, error: "This reward is already marked paid." };
  const referral = await deps.store.getReferral(reward.referralId);
  if (!referral || referral.stage !== "install_complete" || !referral.installCompletedAt) {
    return { ok: false, error: "A reward can be marked paid only after install is complete." };
  }
  const when = deps.now();
  await deps.store.updateReward(reward.id, { status: "paid", paidAt: when, paidBy: staff.id });
  await deps.store.addAudit({ id: deps.id(), actor: staff.id, action: "reward.marked_paid", target: reward.id, time: when });
  return { ok: true, rewardId: reward.id };
}

export async function updateCampaign(deps: Deps, actor: Actor, input: {
  offerText?: string;
  rewardAmount?: number | null;
  customerBenefit?: string | null;
  payoutLine?: string;
  active?: boolean;
}): Promise<Ok<{ campaign: Campaign }> | Fail> {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active" || !canEditCampaign(staff.role)) {
    return { ok: false, error: "You don't have permission to edit the campaign." };
  }
  if (input.rewardAmount !== undefined && input.rewardAmount !== null && (!Number.isFinite(input.rewardAmount) || input.rewardAmount < 0)) {
    return { ok: false, error: "Reward amount must be empty or a non-negative number." };
  }
  const current = await campaignOf(deps);
  const next: Campaign = {
    ...current,
    offerText: input.offerText !== undefined ? input.offerText.trim() : current.offerText,
    rewardAmount: input.rewardAmount !== undefined ? input.rewardAmount : current.rewardAmount,
    customerBenefit: input.customerBenefit !== undefined ? (input.customerBenefit?.trim() || null) : current.customerBenefit,
    payoutLine: input.payoutLine !== undefined ? input.payoutLine.trim() : current.payoutLine,
    active: input.active !== undefined ? Boolean(input.active) : current.active,
  };
  await deps.store.saveCampaign(next);
  await deps.store.addAudit({ id: deps.id(), actor: staff.id, action: "campaign.updated", target: "campaign/default", time: deps.now() });
  return { ok: true, campaign: next };
}

export async function updateTemplates(deps: Deps, actor: Actor, templates: Campaign["templates"]): Promise<Ok<{ templates: Campaign["templates"] }> | Fail> {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active" || !canEditCampaign(staff.role)) {
    return { ok: false, error: "You don't have permission to edit templates." };
  }
  if (customerCopyMentionsMoney(templates.referralConfirmation.body) || customerCopyMentionsMoney(templates.referralConfirmation.subject) || customerCopyMentionsMoney(templates.installThanks.body)) {
    return { ok: false, error: "Customer messages cannot include a reward amount." };
  }
  const current = await campaignOf(deps);
  const next = { ...current, templates };
  await deps.store.saveCampaign(next);
  await deps.store.addAudit({ id: deps.id(), actor: staff.id, action: "templates.updated", target: "campaign/default", time: deps.now() });
  return { ok: true, templates };
}

export async function inviteStaff(deps: Deps, actor: Actor, input: { email?: string; name?: string; role?: string }): Promise<Ok<{ invitePath: string }> | Fail> {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active" || !canInviteStaff(staff.role)) {
    return { ok: false, error: "You don't have permission to invite staff." };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  const name = (input.name ?? "").trim();
  const role = input.role as StaffRole;
  if (!name || !isValidEmail(email) || !ROLES.includes(role)) return { ok: false, error: "Name, email, and a valid role are required." };
  if (await deps.store.getStaffByEmail(email)) return { ok: false, error: "That email is already on the staff list." };
  const token = newSecret();
  const invite: Staff = {
    id: deps.id(),
    email,
    name,
    role,
    twoFactorStatus: "off",
    status: "invited",
    inviteTokenHash: sha256(token),
    inviteExpiresAt: new Date(deps.nowMs() + deps.config.inviteTtlHours * 60 * 60 * 1000).toISOString(),
    createdAt: deps.now(),
  };
  const path = `/admin/invite?token=${token}`;
  const link = deps.config.domain ? `https://${deps.config.domain}${path}` : path;
  try {
    await deps.messaging.sendEmail({
      to: email,
      subject: "Staff portal invite",
      text: `You have been invited to the staff portal as ${role}. Open ${link} to set a password. This message does not include a reward amount.`,
    });
  } catch {
    return { ok: false, error: "The invite email was not sent. Messaging is not configured or the send failed." };
  }
  await deps.store.saveStaff(invite);
  await deps.store.addAudit({ id: deps.id(), actor: staff.id, action: "staff.invited", target: invite.id, time: deps.now() });
  return { ok: true, invitePath: path };
}

export async function acceptInvite(deps: Deps, input: { token?: string; password?: string }, createUser: (email: string, password: string) => Promise<{ uid: string }>): Promise<Ok<{ uid: string }> | Fail> {
  const token = (input.token ?? "").trim();
  const password = input.password ?? "";
  if (!token || password.length < 12) return { ok: false, error: "A valid invite and a password of at least 12 characters are required." };
  const invite = await deps.store.findStaffByInviteHash(sha256(token));
  if (!invite || invite.status !== "invited" || !invite.inviteExpiresAt || invite.inviteExpiresAt < deps.now()) {
    return { ok: false, error: "This invite is no longer valid." };
  }
  const user = await createUser(invite.email, password);
  const active: Staff = { ...invite, id: user.uid, status: "active", inviteTokenHash: null, inviteExpiresAt: null };
  await deps.store.saveStaff(active);
  if (invite.id !== user.uid) await deps.store.deleteStaff(invite.id);
  await deps.store.addAudit({ id: deps.id(), actor: user.uid, action: "staff.accepted_invite", target: user.uid, time: deps.now() });
  return { ok: true, uid: user.uid };
}

export async function importCoverage(deps: Deps, actor: Actor, csv: string): Promise<Ok<{ imported: number }> | Fail> {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active" || staff.role !== "Admin") return { ok: false, error: "Only an Admin can import coverage." };
  const parsed = parseCoverageCsv(csv);
  if (parsed.errors.length) return { ok: false, error: parsed.errors.join(" ") };
  const imported = await deps.store.upsertCoverage(parsed.rows);
  await deps.store.addAudit({ id: deps.id(), actor: staff.id, action: "coverage.imported", target: "coverage", time: deps.now() });
  return { ok: true, imported };
}

export async function handleWebhook(deps: Deps, rawBody: Buffer, signature: string | null) {
  if (!deps.config.ghlWebhookPublicKey) return { status: 503, body: { error: "Webhook verification is not configured." } };
  if (!signature || !verifyEd25519Signature(rawBody, signature, deps.config.ghlWebhookPublicKey)) {
    return { status: 401, body: { error: "Invalid signature." } };
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }
  const eventId = webhookEventId(rawBody, payload);
  if (await deps.store.hasWebhookEvent(eventId)) return { status: 200, body: { duplicate: true } };
  const eventType = typeof payload.type === "string" ? payload.type : "unknown";
  try {
    await deps.store.putWebhookEvent(eventId, eventType, deps.now());
  } catch {
    if (await deps.store.hasWebhookEvent(eventId)) return { status: 200, body: { duplicate: true } };
    throw new Error("Could not record the webhook.");
  }
  await applyWebhookPayload(deps, payload);
  return { status: 200, body: { ok: true } };
}

async function applyWebhookPayload(deps: Deps, payload: Record<string, unknown>) {
  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (eventType === "OpportunityStageUpdate" || typeof payload.stageName === "string") {
    const stage = resolveStage(payload, deps.config.ghlStageIds);
    const opportunityId = typeof payload.id === "string" ? payload.id : "";
    if (stage && opportunityId) await applyStage(deps, opportunityId, stage, deps.now());
  }
  if (eventType === "OutboundMessage" || eventType === "LCEmailStats") {
    const messageType = typeof payload.messageType === "string" ? payload.messageType : "";
    const channel = eventType === "LCEmailStats" || messageType.toLowerCase() === "email" || typeof payload.emailMessageId === "string" ? "email" : "sms";
    if (channel === "email" || messageType) {
      const webhook = payload.webhookPayload as { event?: string; recipient?: string } | undefined;
      await deps.store.addMessageEvent({
        id: deps.id(),
        channel,
        eventType,
        contactId: typeof payload.contactId === "string" ? payload.contactId : "",
        recipient: typeof payload.to === "string" ? payload.to : webhook?.recipient ?? "",
        subject: typeof payload.subject === "string" ? payload.subject : "",
        status: typeof payload.status === "string" ? payload.status : webhook?.event ?? "",
        occurredAt: deps.now(),
      });
    }
  }
}

export async function retryPending(deps: Deps) {
  const referrers = await deps.store.listReferrersPendingSync();
  for (const referrer of referrers) await syncReferrer(deps, referrer.id);
  const referrals = await deps.store.listReferralsPendingSync();
  for (const referral of referrals) await syncReferral(deps, referral.id);
  return { referrers: referrers.length, referrals: referrals.length };
}

export async function reconcile(deps: Deps) {
  const referrals = await deps.store.listReferrals();
  const mismatches: { referralId: string; firestoreStage: string; ghlStage: string | null; detail: string }[] = [];
  let compared = 0;
  for (const referral of referrals) {
    if (!referral.ghlOpportunityId) continue;
    compared += 1;
    try {
      const remote = await deps.crm.getOpportunityStage(referral.ghlOpportunityId);
      if (!remote.stage) {
        mismatches.push({ referralId: referral.id, firestoreStage: referral.stage, ghlStage: null, detail: "GHL stage could not be mapped." });
      } else if (remote.stage !== referral.stage) {
        mismatches.push({ referralId: referral.id, firestoreStage: referral.stage, ghlStage: remote.stage, detail: "Stage differs." });
      }
    } catch (error) {
      const detail = error instanceof NotConfiguredError ? "CRM is not configured." : "GHL lookup failed.";
      mismatches.push({ referralId: referral.id, firestoreStage: referral.stage, ghlStage: null, detail });
    }
  }
  const report = { id: deps.id(), time: deps.now(), compared, mismatches };
  await deps.store.addReconciliation(report);
  return report;
}

export async function integrationStatus(deps: Deps) {
  const { ghlAuthMode } = await import("../../config/site.ts");
  const report = await deps.store.latestReconciliation();
  return {
    crm: ghlAuthMode(deps.config),
    webhookKeyConfigured: Boolean(deps.config.ghlWebhookPublicKey),
    locationConfigured: Boolean(deps.config.ghlLocationId),
    pipelineConfigured: Boolean(deps.config.ghlPipelineId),
    latestReconciliation: report,
  };
}

export async function requireAppCheck(deps: Deps, token: string | undefined): Promise<string | null> {
  if (!deps.appCheckRequired) return null;
  const ok = await deps.verifyAppCheck(token);
  return ok ? null : "App Check failed.";
}

export async function staffSnapshot(deps: Deps, actor: Actor) {
  const staff = await deps.store.getStaff(actor.id);
  if (!staff || staff.status !== "active") return { ok: false as const, error: "Staff sign-in is required." };
  const [referrals, rewards, campaign, uncovered, messages, audit, people] = await Promise.all([
    deps.store.listReferrals(),
    deps.store.listRewards(),
    campaignOf(deps),
    deps.store.listUncoveredZips(),
    deps.store.listMessageEvents(),
    deps.store.listAudit(),
    staff.role === "Admin" ? deps.store.listStaff() : Promise.resolve([staff]),
  ]);
  return { ok: true as const, me: staff, referrals, rewards, campaign, uncovered, messages, audit, staff: people };
}
