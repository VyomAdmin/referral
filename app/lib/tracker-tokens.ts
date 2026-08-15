import { and, eq, isNull, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { trackerTokens } from "../../db/schema.ts";
import { generateSecureToken, hashSecureToken, secureTokenExpiry } from "./secure-token.ts";

export type TrackerTokenKind = "customer" | "referrer";

export async function createTrackerToken(options: {
  kind: TrackerTokenKind;
  referralId?: string;
  referrerId?: string;
  ttlDays?: number;
}) {
  const rawToken = generateSecureToken();
  await getDb().insert(trackerTokens).values({
    id: crypto.randomUUID(),
    kind: options.kind,
    referralId: options.referralId,
    referrerId: options.referrerId,
    tokenHash: hashSecureToken(rawToken),
    expiresAt: secureTokenExpiry(options.ttlDays ?? 90),
  });
  return rawToken;
}

export async function verifyTrackerToken(rawToken: string, kind: TrackerTokenKind) {
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();
  const [match] = await getDb()
    .select()
    .from(trackerTokens)
    .where(and(eq(trackerTokens.tokenHash, tokenHash), eq(trackerTokens.kind, kind), isNull(trackerTokens.revokedAt), gt(trackerTokens.expiresAt, now)))
    .limit(1);
  if (!match) return null;
  return { referralId: match.referralId, referrerId: match.referrerId };
}
