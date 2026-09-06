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

// Scoped to the specific notification. Before templateKey existed this matched
// on campaignId alone, so a single active template overrode EVERY referrer
// email for the campaign — a "your $50 reward is ready" template went out at
// signup, at referral-received, at installation, everywhere. A template with no
// templateKey now overrides nothing, which is what neutralises that class of
// mistake: an unassigned template falls through to the per-event defaults in
// email-templates.ts rather than hijacking all of them.
export async function getActiveCampaignEmailTemplate(campaignId: string, templateKey: string): Promise<CampaignEmailTemplate | null> {
  const [row] = await getDb()
    .select()
    .from(campaignEmailTemplates)
    .where(and(
      eq(campaignEmailTemplates.campaignId, campaignId),
      eq(campaignEmailTemplates.templateKey, templateKey),
      eq(campaignEmailTemplates.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}

export async function getActiveCampaignSmsTemplate(campaignId: string, templateKey: string): Promise<CampaignSmsTemplate | null> {
  const [row] = await getDb()
    .select()
    .from(campaignSmsTemplates)
    .where(and(
      eq(campaignSmsTemplates.campaignId, campaignId),
      eq(campaignSmsTemplates.templateKey, templateKey),
      eq(campaignSmsTemplates.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}
