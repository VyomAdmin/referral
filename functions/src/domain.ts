import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { MARKET_STATES, type MarketState } from "../../config/site.ts";

export const STAGES = [
  "new_referral",
  "appointment_booked",
  "install_scheduled",
  "install_complete",
  "lost",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new_referral: "New referral",
  appointment_booked: "Appointment booked",
  install_scheduled: "Install scheduled",
  install_complete: "Install complete",
  lost: "Lost",
};

export const ROLES = ["Admin", "Marketing", "Ops"] as const;
export type StaffRole = (typeof ROLES)[number];

export function isMarketState(value: string): value is MarketState {
  return (MARKET_STATES as readonly string[]).includes(value);
}

export function stageFromLabel(label: string): Stage | null {
  const normalized = label.trim().toLowerCase();
  for (const stage of STAGES) {
    if (STAGE_LABELS[stage].toLowerCase() === normalized) return stage;
  }
  return null;
}

export function resolveStage(
  payload: { stageName?: unknown; pipelineStageName?: unknown; stage?: unknown; pipelineStageId?: unknown },
  stageIds: Partial<Record<string, string>>,
): Stage | null {
  for (const candidate of [payload.stageName, payload.pipelineStageName, payload.stage]) {
    if (typeof candidate === "string") {
      const named = stageFromLabel(candidate);
      if (named) return named;
    }
  }
  if (typeof payload.pipelineStageId === "string" && payload.pipelineStageId) {
    for (const stage of STAGES) {
      if (stageIds[stage] && stageIds[stage] === payload.pipelineStageId) return stage;
    }
  }
  return null;
}

export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function isValidPhone(phone: string): boolean {
  return phoneDigits(phone).length === 10;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isSelfReferral(
  referrer: { email: string; phone: string },
  customer: { email: string; phone: string },
): boolean {
  const sameEmail = referrer.email.trim().toLowerCase() === customer.email.trim().toLowerCase();
  const samePhone = phoneDigits(referrer.phone) !== "" && phoneDigits(referrer.phone) === phoneDigits(customer.phone);
  return sameEmail || samePhone;
}

export function newReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "RF-";
  for (let index = 0; index < 8; index += 1) code += alphabet[bytes[index]! % alphabet.length];
  return code;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}

export type RewardStatus = "eligible" | "paid";

export function shouldCreateReward(input: { stage: Stage; selfReferral: boolean; rewardExists: boolean }): boolean {
  return input.stage === "install_complete" && !input.selfReferral && !input.rewardExists;
}

export function canEditCampaign(role: StaffRole): boolean {
  return role === "Admin" || role === "Marketing";
}

export function canMarkRewardPaid(role: StaffRole): boolean {
  return role === "Admin" || role === "Ops";
}

export function canInviteStaff(role: StaffRole): boolean {
  return role === "Admin";
}

export function customerCopyMentionsMoney(body: string): boolean {
  return /\$\s*\d/.test(body);
}

export type CoverageRow = { zip: string; state: MarketState };

export function parseCoverageCsv(csv: string): { rows: CoverageRow[]; errors: string[] } {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["The CSV is empty."] };
  const header = lines[0]!.toLowerCase().split(",").map((cell) => cell.trim());
  if (header[0] !== "zip" || header[1] !== "state") {
    return { rows: [], errors: ["The header row must be zip,state."] };
  }
  const rows: CoverageRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < lines.length; index += 1) {
    const [zipRaw = "", stateRaw = ""] = lines[index]!.split(",").map((cell) => cell.trim());
    const lineNo = index + 1;
    if (!/^\d{5}$/.test(zipRaw)) errors.push(`Line ${lineNo}: ZIP must be five digits.`);
    if (!isMarketState(stateRaw)) errors.push(`Line ${lineNo}: state must be FL or SC.`);
    if (/^\d{5}$/.test(zipRaw) && isMarketState(stateRaw)) {
      if (seen.has(zipRaw)) errors.push(`Line ${lineNo}: duplicate ZIP ${zipRaw}.`);
      seen.add(zipRaw);
      rows.push({ zip: zipRaw, state: stateRaw });
    }
  }
  return { rows: errors.length ? [] : rows, errors };
}

// HighLevel's current marketplace webhook signs the raw body with Ed25519.
// crypto.verify performs the check. A string compare is the wrong primitive
// for this signature.
export function verifyEd25519Signature(rawBody: Buffer, signatureHeader: string, publicKeyPem: string): boolean {
  if (!signatureHeader || !publicKeyPem) return false;
  try {
    const key = createPublicKey(publicKeyPem);
    const signature = Buffer.from(signatureHeader, "base64");
    if (signature.length === 0) return false;
    return verify(null, rawBody, key, signature);
  } catch {
    return false;
  }
}

export function webhookEventId(rawBody: Buffer, payload: { webhookId?: unknown }): string {
  if (typeof payload.webhookId === "string" && payload.webhookId.trim()) return payload.webhookId.trim();
  return sha256(rawBody);
}

const MIN_SUBMIT_MS = 800;

export function botCheck(input: { honeypot?: string; startedAt?: number; nowMs: number }): string | null {
  if (input.honeypot && input.honeypot.trim()) return "Could not submit the form.";
  if (typeof input.startedAt !== "number" || !Number.isFinite(input.startedAt)) return "Could not submit the form.";
  if (input.nowMs - input.startedAt < MIN_SUBMIT_MS) return "Could not submit the form.";
  return null;
}

export function isZip(value: string): boolean {
  return /^\d{5}$/.test(value);
}
