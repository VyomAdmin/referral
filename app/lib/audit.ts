import { getDb } from "../../db/index.ts";
import { auditEvents } from "../../db/schema.ts";

export async function logAuditEvent(event: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  organizationId: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}) {
  await getDb().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: event.organizationId,
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    beforeValue: event.beforeValue,
    afterValue: event.afterValue,
  });
}
