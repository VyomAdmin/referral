"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getDb } from "../../../../db/index.ts";
import { teamMembers, users } from "../../../../db/schema.ts";
import { verifyInviteToken, redeemInviteToken } from "../../../lib/invite-tokens";
import { hashPassword } from "../../../lib/password";
import { logAuditEvent } from "../../../lib/audit";
import { signIn } from "../../../lib/auth";

export async function acceptInviteAction(_prevState: string | undefined, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  const invite = await verifyInviteToken(token);
  if (!invite) return "This invite link is invalid or has expired.";
  if (password.length < 8) return "Password must be at least 8 characters.";

  const db = getDb();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email: invite.email, passwordHash });
    await tx.update(teamMembers).set({ userId, status: "active" }).where(eq(teamMembers.id, invite.teamMemberId));
  });
  await redeemInviteToken(invite.inviteId);
  await logAuditEvent({
    actorId: userId,
    action: "invite.accepted",
    targetType: "team_member",
    targetId: invite.teamMemberId,
    organizationId: invite.organizationId,
  });

  try {
    await signIn("credentials", { email: invite.email, password, redirectTo: "/admin" });
  } catch (error) {
    if (error instanceof AuthError) return "Account created, but automatic sign-in failed — sign in manually.";
    throw error;
  }
}
