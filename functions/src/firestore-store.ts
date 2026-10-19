import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Campaign, Coverage, MessageEvent, ReconciliationReport, Referral, Referrer, Reward, Staff, Store, UncoveredZip } from "./store.ts";

function db(): Firestore {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

async function one<T>(path: string): Promise<T | null> {
  const snap = await db().doc(path).get();
  return snap.exists ? (snap.data() as T) : null;
}

export class FirestoreStore implements Store {
  async findReferrerByEmail(email: string) {
    const snap = await db().collection("referrers").where("email", "==", email.toLowerCase()).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Referrer);
  }
  async findReferrerByCode(code: string) {
    const snap = await db().collection("referrers").where("referralCode", "==", code).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Referrer);
  }
  async findReferrerByEmailAndPhone(email: string, phone: string) {
    const row = await this.findReferrerByEmail(email);
    return row && row.phone === phone ? row : null;
  }
  async getReferrer(id: string) {
    return one<Referrer>(`referrers/${id}`);
  }
  async insertReferrer(row: Referrer) {
    await db().collection("referrers").doc(row.id).create(row);
  }
  async updateReferrer(id: string, patch: Partial<Referrer>) {
    await db().collection("referrers").doc(id).set(patch, { merge: true });
  }
  async listReferrersPendingSync() {
    const snap = await db().collection("referrers").where("syncPending", "==", true).get();
    return snap.docs.map((doc) => doc.data() as Referrer);
  }
  async getCoverage(zip: string) {
    return one<Coverage>(`coverage/${zip}`);
  }
  async upsertCoverage(rows: Coverage[]) {
    const batch = db().batch();
    for (const row of rows) batch.set(db().collection("coverage").doc(row.zip), row);
    await batch.commit();
    return rows.length;
  }
  async noteUncoveredZip(zip: string, now: string) {
    const ref = db().collection("uncoveredZips").doc(zip);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? Number(snap.data()?.count ?? 0) + 1 : 1;
      const row: UncoveredZip = { zip, count, lastSeen: now };
      tx.set(ref, row);
    });
  }
  async listUncoveredZips() {
    const snap = await db().collection("uncoveredZips").get();
    return snap.docs.map((doc) => doc.data() as UncoveredZip);
  }
  async insertReferral(row: Referral) {
    await db().collection("referrals").doc(row.id).create(row);
  }
  async updateReferral(id: string, patch: Partial<Referral>) {
    await db().collection("referrals").doc(id).set(patch, { merge: true });
  }
  async getReferral(id: string) {
    return one<Referral>(`referrals/${id}`);
  }
  async findReferralByOpportunity(opportunityId: string) {
    const snap = await db().collection("referrals").where("ghlOpportunityId", "==", opportunityId).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Referral);
  }
  async findReferralByTokenHash(hash: string) {
    const snap = await db().collection("referrals").where("trackingTokenHash", "==", hash).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Referral);
  }
  async listReferralsByReferrer(referrerId: string) {
    const snap = await db().collection("referrals").where("referrerId", "==", referrerId).get();
    return snap.docs.map((doc) => doc.data() as Referral);
  }
  async listReferrals() {
    const snap = await db().collection("referrals").get();
    return snap.docs.map((doc) => doc.data() as Referral);
  }
  async listReferralsPendingSync() {
    const snap = await db().collection("referrals").where("syncPending", "==", true).get();
    return snap.docs.map((doc) => doc.data() as Referral);
  }
  async findRewardByReferral(referralId: string) {
    const snap = await db().collection("rewards").where("referralId", "==", referralId).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Reward);
  }
  async getReward(id: string) {
    return one<Reward>(`rewards/${id}`);
  }
  async insertReward(row: Reward) {
    const existing = await this.findRewardByReferral(row.referralId);
    if (existing) return;
    await db().collection("rewards").doc(row.id).create(row);
  }
  async updateReward(id: string, patch: Partial<Reward>) {
    await db().collection("rewards").doc(id).set(patch, { merge: true });
  }
  async listRewards() {
    const snap = await db().collection("rewards").get();
    return snap.docs.map((doc) => doc.data() as Reward);
  }
  async getCampaign() {
    return one<Campaign>("campaign/default");
  }
  async saveCampaign(row: Campaign) {
    await db().doc("campaign/default").set(row);
  }
  async hasWebhookEvent(id: string) {
    const snap = await db().collection("webhookEvents").doc(id).get();
    return snap.exists;
  }
  async putWebhookEvent(id: string, eventType: string, time: string) {
    await db().collection("webhookEvents").doc(id).create({ id, eventType, time });
  }
  async addMessageEvent(row: MessageEvent) {
    await db().collection("messageEvents").doc(row.id).create(row);
  }
  async listMessageEvents() {
    const snap = await db().collection("messageEvents").orderBy("occurredAt", "desc").limit(100).get();
    return snap.docs.map((doc) => doc.data() as MessageEvent);
  }
  async addAudit(row: AuditEvent) {
    await db().collection("auditEvents").doc(row.id).create(row);
  }
  async listAudit() {
    const snap = await db().collection("auditEvents").orderBy("time", "desc").limit(100).get();
    return snap.docs.map((doc) => doc.data() as AuditEvent);
  }
  async getStaff(id: string) {
    return one<Staff>(`staff/${id}`);
  }
  async getStaffByEmail(email: string) {
    const snap = await db().collection("staff").where("email", "==", email.toLowerCase()).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Staff);
  }
  async findStaffByInviteHash(hash: string) {
    const snap = await db().collection("staff").where("inviteTokenHash", "==", hash).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as Staff);
  }
  async saveStaff(row: Staff) {
    await db().collection("staff").doc(row.id).set(row);
  }
  async deleteStaff(id: string) {
    await db().collection("staff").doc(id).delete();
  }
  async listStaff() {
    const snap = await db().collection("staff").get();
    return snap.docs.map((doc) => doc.data() as Staff);
  }
  async addReconciliation(row: ReconciliationReport) {
    await db().collection("reconciliationReports").doc(row.id).create(row);
  }
  async latestReconciliation() {
    const snap = await db().collection("reconciliationReports").orderBy("time", "desc").limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as ReconciliationReport);
  }
  async takeRateLimit(key: string, limit: number, windowMs: number, nowMs: number) {
    const ref = db().collection("rateLimits").doc(key);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const hits = ((snap.data()?.hits as number[] | undefined) ?? []).filter((at) => nowMs - at < windowMs);
      if (hits.length >= limit) {
        tx.set(ref, { hits });
        return false;
      }
      hits.push(nowMs);
      tx.set(ref, { hits, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }
}
