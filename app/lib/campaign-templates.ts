import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { campaignEmailTemplates, campaignSmsTemplates } from "../../db/schema.ts";

export type CampaignEmailTemplate = typeof campaignEmailTemplates.$inferSelect;
export type CampaignSmsTemplate = typeof campaignSmsTemplates.$inferSelect;

export async function getCampaignEmailTemplates(campaignId: string): Promise<CampaignEmailTemplate[]> {
  return getDb().select().from(campaignEmailTemplates).where(eq(campaignEmailTemplates.campaignId, campaignId)).orderBy(desc(campaignEmailTemplates.createdAt));
}

export async function getCampaignSmsTemplates(campaignId: string): Promise<CampaignSmsTemplate[]> {
  return getDb().select().from(campaignSmsTemplates).where(eq(campaignSmsTemplates.campaignId, campaignId)).orderBy(desc(campaignSmsTemplates.createdAt));
}

export async function getActiveCampaignEmailTemplate(campaignId: string): Promise<CampaignEmailTemplate | null> {
  const [row] = await getDb().select().from(campaignEmailTemplates).where(and(eq(campaignEmailTemplates.campaignId, campaignId), eq(campaignEmailTemplates.isActive, true))).limit(1);
  return row ?? null;
}

export async function getActiveCampaignSmsTemplate(campaignId: string): Promise<CampaignSmsTemplate | null> {
  const [row] = await getDb().select().from(campaignSmsTemplates).where(and(eq(campaignSmsTemplates.campaignId, campaignId), eq(campaignSmsTemplates.isActive, true))).limit(1);
  return row ?? null;
}
