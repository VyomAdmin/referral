import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
};

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandName: text("brand_name").notNull(),
  primaryColor: text("primary_color").notNull().default("#0669a8"),
  referralDomain: text("referral_domain"),
  ...timestamps,
});

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  state: text("state").notNull(),
  active: boolean("active").notNull().default(true),
  customerOffer: text("customer_offer"),
  referrerRewardCents: integer("referrer_reward_cents").notNull().default(5000),
  serviceMessage: text("service_message").notNull(),
  zipRule: text("zip_rule").notNull(),
  formSchema: jsonb("form_schema"),
  ...timestamps,
}, (table) => [uniqueIndex("campaign_org_state_idx").on(table.organizationId, table.state)]);

export const referrers = pgTable("referrers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  code: text("code").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull().default("active"),
  hubspotContactId: text("hubspot_contact_id"),
  ...timestamps,
}, (table) => [uniqueIndex("referrer_org_code_idx").on(table.organizationId, table.code)]);

export const referrals = pgTable("referrals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  referrerId: text("referrer_id").notNull().references(() => referrers.id),
  customerFirstName: text("customer_first_name").notNull(),
  customerLastName: text("customer_last_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  zip: text("zip").notNull(),
  state: text("state").notNull(),
  vehicleMake: text("vehicle_make"),
  vehicleYear: text("vehicle_year"),
  vehicleModel: text("vehicle_model"),
  insuranceProvider: text("insurance_provider"),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }).notNull(),
  publicStatus: text("public_status").notNull().default("received"),
  installationCompletedAt: timestamp("installation_completed_at", { withTimezone: true }),
  paidByUserId: text("paid_by_user_id"),
  paidByName: text("paid_by_name"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  hubspotContactId: text("hubspot_contact_id"),
  hubspotDealId: text("hubspot_deal_id"),
  hubspotStage: text("hubspot_stage"),
  syncStatus: text("sync_status").notNull().default("pending"),
  hubspotSyncedAt: timestamp("hubspot_synced_at", { withTimezone: true }),
  hubspotSyncError: text("hubspot_sync_error"),
  ...timestamps,
}, (table) => [uniqueIndex("referral_hubspot_deal_idx").on(table.organizationId, table.hubspotDealId)]);

export const referralEvents = pgTable("referral_events", {
  id: text("id").primaryKey(),
  referralId: text("referral_id").notNull().references(() => referrals.id),
  eventType: text("event_type").notNull(),
  publicStatus: text("public_status"),
  source: text("source").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const rewards = pgTable("rewards", {
  id: text("id").primaryKey(),
  referralId: text("referral_id").notNull().references(() => referrals.id).unique(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending_installation"),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  ...timestamps,
});

export const emailEvents = pgTable("email_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  referralId: text("referral_id").references(() => referrals.id),
  referrerId: text("referrer_id").references(() => referrers.id),
  // Which campaign_email_templates row (if any) rendered this send — null means
  // the legacy hardcoded template (app/lib/email-templates.ts) was used because
  // the campaign has no active custom template. Required for the spec's audit ask.
  templateId: text("template_id").references(() => campaignEmailTemplates.id),
  templateKey: text("template_key").notNull(),
  recipient: text("recipient").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  state: text("state"),
  ...timestamps,
});

export const smsEvents = pgTable("sms_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  referralId: text("referral_id").references(() => referrals.id),
  referrerId: text("referrer_id").references(() => referrers.id),
  templateId: text("template_id").references(() => campaignSmsTemplates.id),
  templateKey: text("template_key").notNull(),
  recipient: text("recipient").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  ...timestamps,
});

// One row per draft/active email variant a campaign could send to referrers.
// At most one row per campaign may have is_active = true, enforced by the
// partial unique index below (not just app-level checks).
export const campaignEmailTemplates = pgTable("campaign_email_templates", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  ...timestamps,
}, (table) => [
  uniqueIndex("campaign_email_templates_active_idx").on(table.campaignId).where(sql`${table.isActive} = true`),
]);

export const campaignSmsTemplates = pgTable("campaign_sms_templates", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  ...timestamps,
}, (table) => [
  uniqueIndex("campaign_sms_templates_active_idx").on(table.campaignId).where(sql`${table.isActive} = true`),
]);

export const webhookEvents = pgTable("webhook_events", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  organizationId: text("organization_id"),
  provider: text("provider").notNull(),
  objectId: text("object_id").notNull(),
  eventType: text("event_type").notNull(),
  propertyName: text("property_name"),
  propertyValue: text("property_value"),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  ...timestamps,
});

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").references(() => users.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("invited"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("team_org_email_idx").on(table.organizationId, table.email)]);

export const trackerTokens = pgTable("tracker_tokens", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  referralId: text("referral_id").references(() => referrals.id),
  referrerId: text("referrer_id").references(() => referrers.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const inviteTokens = pgTable("invite_tokens", {
  id: text("id").primaryKey(),
  teamMemberId: text("team_member_id").notNull().references(() => teamMembers.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const verificationAttempts = pgTable("verification_attempts", {
  id: text("id").primaryKey(),
  scopeKey: text("scope_key").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// One row per customer ZIP entry that falls outside serviceableZips.json —
// the single place ops looks to see real demand outside the current service
// area, to prioritize expansion instead of guessing from anecdotes.
export const nonServiceableZipAttempts = pgTable("non_serviceable_zip_attempts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id),
  zip: text("zip").notNull(),
  referrerCode: text("referrer_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});
