import { and, eq, isNull, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { inviteTokens, teamMembers } from "../../db/schema.ts";
import { generateSecureToken, hashSecureToken, secureTokenExpiry } from "./secure-token.ts";

export async function createInviteToken(teamMemberId: string, ttlDays = 7) {
  const rawToken = generateSecureToken();
  await getDb().insert(inviteTokens).values({
    id: crypto.randomUUID(),
    teamMemberId,
    tokenHash: hashSecureToken(rawToken),
    expiresAt: secureTokenExpiry(ttlDays),
  });
  return rawToken;
}

export async function revokeInviteTokensForTeamMember(teamMemberId: string) {
  await getDb()
    .update(inviteTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(inviteTokens.teamMemberId, teamMemberId), isNull(inviteTokens.redeemedAt), isNull(inviteTokens.revokedAt)));
}

export async function verifyInviteToken(rawToken: string) {
  const tokenHash = hashSecureToken(rawToken);
  const now = new Date();
  const [match] = await getDb()
    .select({
      inviteId: inviteTokens.id,
      teamMemberId: teamMembers.id,
      email: teamMembers.email,
      name: teamMembers.name,
      role: teamMembers.role,
      organizationId: teamMembers.organizationId,
    })
    .from(inviteTokens)
    .innerJoin(teamMembers, eq(inviteTokens.teamMemberId, teamMembers.id))
    .where(and(eq(inviteTokens.tokenHash, tokenHash), isNull(inviteTokens.redeemedAt), isNull(inviteTokens.revokedAt), gt(inviteTokens.expiresAt, now)))
    .limit(1);
  return match ?? null;
}

export async function redeemInviteToken(inviteId: string) {
  await getDb().update(inviteTokens).set({ redeemedAt: new Date() }).where(eq(inviteTokens.id, inviteId));
}
