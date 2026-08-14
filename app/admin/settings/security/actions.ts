"use server";

import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/index.ts";
import { users } from "../../../../db/schema.ts";
import { auth } from "../../../lib/auth";
import { verifyTotpCode } from "../../../lib/totp";
import { logAuditEvent } from "../../../lib/audit";

export async function confirmTotpEnrollment(_prevState: string | undefined, formData: FormData) {
  const session = await auth();
  if (!session?.user?.organizationId) return "Not signed in.";

  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!secret || !(await verifyTotpCode(secret, code))) {
    return "That code didn't match. Scan the QR code again and try the current 6-digit code.";
  }

  await getDb().update(users).set({ totpSecret: secret, totpEnabled: true }).where(eq(users.id, session.user.id));
  await logAuditEvent({
    actorId: session.user.id,
    action: "totp.enabled",
    targetType: "user",
    targetId: session.user.id,
    organizationId: session.user.organizationId,
  });
  return "success";
}
