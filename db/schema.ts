import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandName: text("brand_name").notNull(),
  primaryColor: text("primary_color").notNull().default("#0669a8"),
  referralDomain: text("referral_domain"),
  ...timestamps,
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  state: text("state").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  customerOffer: text("customer_offer"),
  referrerRewardCents: integer("referrer_reward_cents").notNull().default(5000),
  serviceMessage: text("service_message").notNull(),
  zipRule: text("zip_rule").notNull(),
  formSchema: text("form_schema", { mode: "json" }),
  ...timestamps,
}, (table) => [uniqueIndex("campaign_org_state_idx").on(table.organizationId, table.state)]);

export const referrers = sqliteTable("referrers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  code: text("code").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [uniqueIndex("referrer_org_code_idx").on(table.organizationId, table.code)]);

export const referrals = sqliteTable("referrals", {
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
  publicStatus: text("public_status").notNull().default("received"),
  installationCompletedAt: text("installation_completed_at"),
  hubspotContactId: text("hubspot_contact_id"),
  hubspotDealId: text("hubspot_deal_id"),
  hubspotStage: text("hubspot_stage"),
  syncStatus: text("sync_status").notNull().default("pending"),
  ...timestamps,
}, (table) => [uniqueIndex("referral_hubspot_deal_idx").on(table.organizationId, table.hubspotDealId)]);

export const referralEvents = sqliteTable("referral_events", {
  id: text("id").primaryKey(),
  referralId: text("referral_id").notNull().references(() => referrals.id),
  eventType: text("event_type").notNull(),
  publicStatus: text("public_status"),
  source: text("source").notNull(),
  summary: text("summary").notNull(),
  metadata: text("metadata", { mode: "json" }),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(),
  referralId: text("referral_id").notNull().references(() => referrals.id).unique(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending_installation"),
  eligibleAt: text("eligible_at"),
  paidAt: text("paid_at"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  ...timestamps,
});

export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  referralId: text("referral_id").references(() => referrals.id),
  referrerId: text("referrer_id").references(() => referrers.id),
  templateKey: text("template_key").notNull(),
  recipient: text("recipient").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default("queued"),
  state: text("state"),
  ...timestamps,
});

export const webhookEvents = sqliteTable("webhook_events", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  organizationId: text("organization_id"),
  provider: text("provider").notNull(),
  objectId: text("object_id").notNull(),
  eventType: text("event_type").notNull(),
  propertyName: text("property_name"),
  propertyValue: text("property_value"),
  payload: text("payload", { mode: "json" }).notNull(),
  processedAt: text("processed_at"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id"),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("invited"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("team_org_email_idx").on(table.organizationId, table.email)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeValue: text("before_value", { mode: "json" }),
  afterValue: text("after_value", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
