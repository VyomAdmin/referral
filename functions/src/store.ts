import type { MarketState } from "../../config/site.ts";
import type { RewardStatus, StaffRole, Stage } from "./domain.ts";

export type Referrer = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  referralCode: string;
  consentText: string;
  consentAt: string;
  smsConsentText: string;
  smsConsentAt: string;
  ghlContactId: string | null;
  syncPending: boolean;
  createdAt: string;
};

export type Referral = {
  id: string;
  referrerId: string;
  customerName: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  consentText: string;
  consentAt: string;
  smsConsentText: string;
  smsConsentAt: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  zip: string;
  state: MarketState;
  stage: Stage;
  installCompletedAt: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  trackingTokenHash: string;
  syncPending: boolean;
  syncError: string | null;
  createdAt: string;
};

export type Reward = {
  id: string;
  referralId: string;
  referrerId: string;
  amount: number | null;
  status: RewardStatus;
  paidAt: string | null;
  paidBy: string | null;
  createdAt: string;
};

export type TemplateCopy = { subject: string; body: string };

export type Campaign = {
  offerText: string;
  rewardAmount: number | null;
  customerBenefit: string | null;
  payoutLine: string;
  active: boolean;
  templates: {
    referrerWelcome: TemplateCopy;
    referralConfirmation: TemplateCopy;
    installThanks: TemplateCopy;
  };
};

export type Staff = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  twoFactorStatus: "off" | "enrolled";
  status: "invited" | "active";
  inviteTokenHash: string | null;
  inviteExpiresAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
};

export type MessageEvent = {
  id: string;
  channel: "email" | "sms";
  eventType: string;
  contactId: string;
  recipient: string;
  subject: string;
  status: string;
  occurredAt: string;
};

export type ReconciliationMismatch = {
  referralId: string;
  firestoreStage: string;
  ghlStage: string | null;
  detail: string;
};

export type ReconciliationReport = {
  id: string;
  time: string;
  compared: number;
  mismatches: ReconciliationMismatch[];
};

export type Coverage = { zip: string; state: MarketState };

export type UncoveredZip = { zip: string; count: number; lastSeen: string };

export type Store = {
  findReferrerByEmail(email: string): Promise<Referrer | null>;
  findReferrerByCode(code: string): Promise<Referrer | null>;
  findReferrerByEmailAndPhone(email: string, phoneDigits: string): Promise<Referrer | null>;
  getReferrer(id: string): Promise<Referrer | null>;
  insertReferrer(row: Referrer): Promise<void>;
  updateReferrer(id: string, patch: Partial<Referrer>): Promise<void>;
  listReferrersPendingSync(): Promise<Referrer[]>;
  getCoverage(zip: string): Promise<Coverage | null>;
  upsertCoverage(rows: Coverage[]): Promise<number>;
  noteUncoveredZip(zip: string, now: string): Promise<void>;
  listUncoveredZips(): Promise<UncoveredZip[]>;
  insertReferral(row: Referral): Promise<void>;
  updateReferral(id: string, patch: Partial<Referral>): Promise<void>;
  getReferral(id: string): Promise<Referral | null>;
  findReferralByOpportunity(opportunityId: string): Promise<Referral | null>;
  findReferralByTokenHash(hash: string): Promise<Referral | null>;
  listReferralsByReferrer(referrerId: string): Promise<Referral[]>;
  listReferrals(): Promise<Referral[]>;
  listReferralsPendingSync(): Promise<Referral[]>;
  findRewardByReferral(referralId: string): Promise<Reward | null>;
  getReward(id: string): Promise<Reward | null>;
  insertReward(row: Reward): Promise<void>;
  updateReward(id: string, patch: Partial<Reward>): Promise<void>;
  listRewards(): Promise<Reward[]>;
  getCampaign(): Promise<Campaign | null>;
  saveCampaign(row: Campaign): Promise<void>;
  hasWebhookEvent(id: string): Promise<boolean>;
  putWebhookEvent(id: string, eventType: string, time: string): Promise<void>;
  addMessageEvent(row: MessageEvent): Promise<void>;
  listMessageEvents(): Promise<MessageEvent[]>;
  addAudit(row: AuditEvent): Promise<void>;
  listAudit(): Promise<AuditEvent[]>;
  getStaff(id: string): Promise<Staff | null>;
  getStaffByEmail(email: string): Promise<Staff | null>;
  findStaffByInviteHash(hash: string): Promise<Staff | null>;
  saveStaff(row: Staff): Promise<void>;
  deleteStaff(id: string): Promise<void>;
  listStaff(): Promise<Staff[]>;
  addReconciliation(row: ReconciliationReport): Promise<void>;
  latestReconciliation(): Promise<ReconciliationReport | null>;
  takeRateLimit(key: string, limit: number, windowMs: number, nowMs: number): Promise<boolean>;
};

export function emptyTemplates(): Campaign["templates"] {
  return {
    referrerWelcome: { subject: "", body: "" },
    referralConfirmation: { subject: "", body: "" },
    installThanks: { subject: "", body: "" },
  };
}

export class MemoryStore implements Store {
  referrers: Referrer[] = [];
  referrals: Referral[] = [];
  rewards: Reward[] = [];
  coverage = new Map<string, Coverage>();
  uncovered = new Map<string, UncoveredZip>();
  campaign: Campaign | null = null;
  webhookEvents = new Set<string>();
  messageEvents: MessageEvent[] = [];
  audit: AuditEvent[] = [];
  staff: Staff[] = [];
  reports: ReconciliationReport[] = [];
  private hits: { key: string; at: number }[] = [];

  async findReferrerByEmail(email: string) {
    return this.referrers.find((row) => row.email === email.toLowerCase()) ?? null;
  }
  async findReferrerByCode(code: string) {
    return this.referrers.find((row) => row.referralCode === code) ?? null;
  }
  async findReferrerByEmailAndPhone(email: string, digits: string) {
    return this.referrers.find((row) => row.email === email.toLowerCase() && row.phone === digits) ?? null;
  }
  async getReferrer(id: string) {
    return this.referrers.find((row) => row.id === id) ?? null;
  }
  async insertReferrer(row: Referrer) {
    if (this.referrers.some((item) => item.email === row.email)) throw new Error("Referrer email already exists.");
    this.referrers.push(row);
  }
  async updateReferrer(id: string, patch: Partial<Referrer>) {
    const row = await this.getReferrer(id);
    if (row) Object.assign(row, patch);
  }
  async listReferrersPendingSync() {
    return this.referrers.filter((row) => row.syncPending);
  }
  async getCoverage(zip: string) {
    return this.coverage.get(zip) ?? null;
  }
  async upsertCoverage(rows: Coverage[]) {
    for (const row of rows) this.coverage.set(row.zip, row);
    return rows.length;
  }
  async noteUncoveredZip(zip: string, now: string) {
    const current = this.uncovered.get(zip);
    this.uncovered.set(zip, { zip, count: (current?.count ?? 0) + 1, lastSeen: now });
  }
  async listUncoveredZips() {
    return [...this.uncovered.values()];
  }
  async insertReferral(row: Referral) {
    this.referrals.push(row);
  }
  async updateReferral(id: string, patch: Partial<Referral>) {
    const row = await this.getReferral(id);
    if (row) Object.assign(row, patch);
  }
  async getReferral(id: string) {
    return this.referrals.find((row) => row.id === id) ?? null;
  }
  async findReferralByOpportunity(opportunityId: string) {
    return this.referrals.find((row) => row.ghlOpportunityId === opportunityId) ?? null;
  }
  async findReferralByTokenHash(hash: string) {
    return this.referrals.find((row) => row.trackingTokenHash === hash) ?? null;
  }
  async listReferralsByReferrer(referrerId: string) {
    return this.referrals.filter((row) => row.referrerId === referrerId);
  }
  async listReferrals() {
    return [...this.referrals];
  }
  async listReferralsPendingSync() {
    return this.referrals.filter((row) => row.syncPending);
  }
  async findRewardByReferral(referralId: string) {
    return this.rewards.find((row) => row.referralId === referralId) ?? null;
  }
  async getReward(id: string) {
    return this.rewards.find((row) => row.id === id) ?? null;
  }
  async insertReward(row: Reward) {
    if (this.rewards.some((item) => item.referralId === row.referralId)) return;
    this.rewards.push(row);
  }
  async updateReward(id: string, patch: Partial<Reward>) {
    const row = await this.getReward(id);
    if (row) Object.assign(row, patch);
  }
  async listRewards() {
    return [...this.rewards];
  }
  async getCampaign() {
    return this.campaign;
  }
  async saveCampaign(row: Campaign) {
    this.campaign = structuredClone(row);
  }
  async hasWebhookEvent(id: string) {
    return this.webhookEvents.has(id);
  }
  async putWebhookEvent(id: string) {
    this.webhookEvents.add(id);
  }
  async addMessageEvent(row: MessageEvent) {
    this.messageEvents.push(row);
  }
  async listMessageEvents() {
    return [...this.messageEvents];
  }
  async addAudit(row: AuditEvent) {
    this.audit.push(row);
  }
  async listAudit() {
    return [...this.audit];
  }
  async getStaff(id: string) {
    return this.staff.find((row) => row.id === id) ?? null;
  }
  async getStaffByEmail(email: string) {
    return this.staff.find((row) => row.email === email.toLowerCase()) ?? null;
  }
  async findStaffByInviteHash(hash: string) {
    return this.staff.find((row) => row.inviteTokenHash === hash) ?? null;
  }
  async saveStaff(row: Staff) {
    const index = this.staff.findIndex((item) => item.id === row.id);
    if (index >= 0) this.staff[index] = row;
    else this.staff.push(row);
  }
  async deleteStaff(id: string) {
    this.staff = this.staff.filter((row) => row.id !== id);
  }
  async listStaff() {
    return [...this.staff];
  }
  async addReconciliation(row: ReconciliationReport) {
    this.reports.push(row);
  }
  async latestReconciliation() {
    return this.reports.at(-1) ?? null;
  }
  async takeRateLimit(key: string, limit: number, windowMs: number, nowMs: number) {
    this.hits = this.hits.filter((hit) => nowMs - hit.at < windowMs);
    const count = this.hits.filter((hit) => hit.key === key).length;
    if (count >= limit) return false;
    this.hits.push({ key, at: nowMs });
    return true;
  }
}
