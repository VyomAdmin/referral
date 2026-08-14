import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { trackerTokens } from "../../db/schema.ts";

export type TrackerTokenKind = "customer" | "referrer";

export function generateTrackerToken() {
  return randomBytes(32).toString("base64url");
}

export function hashTrackerToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function trackerTokenExpiry(ttlDays: number, from = new Date()) {
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export async function createTrackerToken(options: {
  kind: TrackerTokenKind;
  referralId?: string;
  referrerId?: string;
  ttlDays?: number;
}) {
  const rawToken = generateTrackerToken();
  await getDb().insert(trackerTokens).values({
    id: crypto.randomUUID(),
    kind: options.kind,
    referralId: options.referralId,
    referrerId: options.referrerId,
    tokenHash: hashTrackerToken(rawToken),
    expiresAt: trackerTokenExpiry(options.ttlDays ?? 90),
  });
  return rawToken;
}

export async function verifyTrackerToken(rawToken: string, kind: TrackerTokenKind) {
  const tokenHash = hashTrackerToken(rawToken);
  const now = new Date();
  const [match] = await getDb()
    .select()
    .from(trackerTokens)
    .where(and(eq(trackerTokens.tokenHash, tokenHash), eq(trackerTokens.kind, kind), isNull(trackerTokens.revokedAt), gt(trackerTokens.expiresAt, now)))
    .limit(1);
  if (!match) return null;
  return { referralId: match.referralId, referrerId: match.referrerId };
}
