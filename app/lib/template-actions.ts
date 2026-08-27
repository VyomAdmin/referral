"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaignEmailTemplates, campaignSmsTemplates, campaigns } from "../../db/schema.ts";
import { auth, requireRole } from "./auth";
import { logAuditEvent } from "./audit";
import { MARKETING_ROLES } from "./roles.ts";
import { getCampaignEmailTemplates, getCampaignSmsTemplates } from "./campaign-templates.ts";
import type { CampaignEmailTemplate, CampaignSmsTemplate } from "./campaign-templates.ts";

async function requireMarketingSession() {
  const session = await auth();
  if (!session?.user?.organizationId || !requireRole(session, MARKETING_ROLES)) return null;
  return session;
}

async function assertCampaignInOrg(campaignId: string, organizationId: string) {
  const [row] = await getDb().select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId))).limit(1);
  return Boolean(row);
}

export type TemplateActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type EmailTemplateInput = { campaignId: string; name: string; subject: string; bodyHtml: string; bodyText?: string };

export async function createEmailTemplateAction(input: EmailTemplateInput): Promise<TemplateActionResult<CampaignEmailTemplate>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };
  if (!input.name.trim() || !input.subject.trim() || !input.bodyHtml.trim()) {
    return { ok: false, error: "Enter a name, subject, and body." };
  }
  if (!(await assertCampaignInOrg(input.campaignId, session.user.organizationId!))) {
    return { ok: false, error: "Campaign not found." };
  }

  const [created] = await getDb().insert(campaignEmailTemplates).values({
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    name: input.name.trim(),
    subject: input.subject.trim(),
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText?.trim() || null,
    createdBy: session.user.id ?? null,
    updatedBy: session.user.id ?? null,
  }).returning();

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "email_template.created", targetType: "campaign_email_template", targetId: created.id, organizationId: session.user.organizationId! });
  return { ok: true, value: created };
}

export async function updateEmailTemplateAction(id: string, input: Omit<EmailTemplateInput, "campaignId">): Promise<TemplateActionResult<CampaignEmailTemplate>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };
  if (!input.name.trim() || !input.subject.trim() || !input.bodyHtml.trim()) {
    return { ok: false, error: "Enter a name, subject, and body." };
  }

  const [updated] = await getDb().update(campaignEmailTemplates)
    .set({ name: input.name.trim(), subject: input.subject.trim(), bodyHtml: input.bodyHtml, bodyText: input.bodyText?.trim() || null, updatedBy: session.user.id ?? null, updatedAt: new Date() })
    .where(eq(campaignEmailTemplates.id, id))
    .returning();
  if (!updated) return { ok: false, error: "Template not found." };

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "email_template.updated", targetType: "campaign_email_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: updated };
}

// Deactivates whatever is currently active for the campaign, then activates
// the target — as two sequential statements, not concurrent ones, so the
// partial unique index (one active row per campaign) is never violated: by
// the time the second UPDATE runs, zero rows for this campaign are active.
export async function activateEmailTemplateAction(id: string): Promise<TemplateActionResult<CampaignEmailTemplate[]>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };

  const [target] = await getDb().select().from(campaignEmailTemplates).where(eq(campaignEmailTemplates.id, id)).limit(1);
  if (!target) return { ok: false, error: "Template not found." };

  await getDb().transaction(async (tx) => {
    await tx.update(campaignEmailTemplates).set({ isActive: false, updatedAt: new Date() }).where(and(eq(campaignEmailTemplates.campaignId, target.campaignId), eq(campaignEmailTemplates.isActive, true)));
    await tx.update(campaignEmailTemplates).set({ isActive: true, updatedBy: session.user.id ?? null, updatedAt: new Date() }).where(eq(campaignEmailTemplates.id, id));
  });

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "email_template.activated", targetType: "campaign_email_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: await getCampaignEmailTemplates(target.campaignId) };
}

export async function deleteEmailTemplateAction(id: string): Promise<TemplateActionResult<null>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };

  const [target] = await getDb().select({ isActive: campaignEmailTemplates.isActive }).from(campaignEmailTemplates).where(eq(campaignEmailTemplates.id, id)).limit(1);
  if (!target) return { ok: false, error: "Template not found." };
  if (target.isActive) return { ok: false, error: "Activate a different template before deleting the active one." };

  await getDb().delete(campaignEmailTemplates).where(eq(campaignEmailTemplates.id, id));
  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "email_template.deleted", targetType: "campaign_email_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: null };
}

export type SmsTemplateInput = { campaignId: string; name: string; body: string };

export async function createSmsTemplateAction(input: SmsTemplateInput): Promise<TemplateActionResult<CampaignSmsTemplate>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };
  if (!input.name.trim() || !input.body.trim()) return { ok: false, error: "Enter a name and message body." };
  if (!(await assertCampaignInOrg(input.campaignId, session.user.organizationId!))) return { ok: false, error: "Campaign not found." };

  const [created] = await getDb().insert(campaignSmsTemplates).values({
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    name: input.name.trim(),
    body: input.body,
    createdBy: session.user.id ?? null,
    updatedBy: session.user.id ?? null,
  }).returning();

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "sms_template.created", targetType: "campaign_sms_template", targetId: created.id, organizationId: session.user.organizationId! });
  return { ok: true, value: created };
}

export async function updateSmsTemplateAction(id: string, input: Omit<SmsTemplateInput, "campaignId">): Promise<TemplateActionResult<CampaignSmsTemplate>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };
  if (!input.name.trim() || !input.body.trim()) return { ok: false, error: "Enter a name and message body." };

  const [updated] = await getDb().update(campaignSmsTemplates)
    .set({ name: input.name.trim(), body: input.body, updatedBy: session.user.id ?? null, updatedAt: new Date() })
    .where(eq(campaignSmsTemplates.id, id))
    .returning();
  if (!updated) return { ok: false, error: "Template not found." };

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "sms_template.updated", targetType: "campaign_sms_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: updated };
}

export async function activateSmsTemplateAction(id: string): Promise<TemplateActionResult<CampaignSmsTemplate[]>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };

  const [target] = await getDb().select().from(campaignSmsTemplates).where(eq(campaignSmsTemplates.id, id)).limit(1);
  if (!target) return { ok: false, error: "Template not found." };

  await getDb().transaction(async (tx) => {
    await tx.update(campaignSmsTemplates).set({ isActive: false, updatedAt: new Date() }).where(and(eq(campaignSmsTemplates.campaignId, target.campaignId), eq(campaignSmsTemplates.isActive, true)));
    await tx.update(campaignSmsTemplates).set({ isActive: true, updatedBy: session.user.id ?? null, updatedAt: new Date() }).where(eq(campaignSmsTemplates.id, id));
  });

  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "sms_template.activated", targetType: "campaign_sms_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: await getCampaignSmsTemplates(target.campaignId) };
}

export async function deleteSmsTemplateAction(id: string): Promise<TemplateActionResult<null>> {
  const session = await requireMarketingSession();
  if (!session) return { ok: false, error: "You don't have permission to manage message templates." };

  const [target] = await getDb().select({ isActive: campaignSmsTemplates.isActive }).from(campaignSmsTemplates).where(eq(campaignSmsTemplates.id, id)).limit(1);
  if (!target) return { ok: false, error: "Template not found." };
  if (target.isActive) return { ok: false, error: "Activate a different template before deleting the active one." };

  await getDb().delete(campaignSmsTemplates).where(eq(campaignSmsTemplates.id, id));
  await logAuditEvent({ actorId: session.user.id ?? "unknown", action: "sms_template.deleted", targetType: "campaign_sms_template", targetId: id, organizationId: session.user.organizationId! });
  return { ok: true, value: null };
}
