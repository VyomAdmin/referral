"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { teamMembers } from "../../db/schema.ts";
import { auth } from "./auth";
import { ADMIN_ROLES, ASSIGNABLE_ROLES } from "./roles";
import { createInviteToken, revokeInviteTokensForTeamMember } from "./invite-tokens";
import { logAuditEvent } from "./audit";

export type InviteUserState = { status: "error"; message: string } | { status: "success"; inviteUrl: string } | undefined;

export async function inviteUserAction(_prevState: InviteUserState, formData: FormData): Promise<InviteUserState> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.role || !ADMIN_ROLES.includes(session.user.role)) {
    return { status: "error", message: "You don't have permission to invite team members." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!name || !email || !role) return { status: "error", message: "Name, email, and role are all required." };
  if (!ASSIGNABLE_ROLES.includes(role)) return { status: "error", message: "Not a valid role." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Enter a valid email address." };

  const organizationId = session.user.organizationId;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.organizationId, organizationId), eq(teamMembers.email, email)))
    .limit(1);

  if (existing?.status === "active") {
    return { status: "error", message: "That person is already an active team member." };
  }

  let teamMemberId: string;
  if (existing) {
    teamMemberId = existing.id;
    await db.update(teamMembers).set({ name, role }).where(eq(teamMembers.id, teamMemberId));
    await revokeInviteTokensForTeamMember(teamMemberId);
  } else {
    teamMemberId = crypto.randomUUID();
    await db.insert(teamMembers).values({ id: teamMemberId, organizationId, email, name, role, status: "invited" });
  }

  const token = await createInviteToken(teamMemberId);
  await logAuditEvent({
    actorId: session.user.id,
    action: "team_member.invited",
    targetType: "team_member",
    targetId: teamMemberId,
    organizationId,
  });

  return { status: "success", inviteUrl: `/admin/invite/${token}` };
}
