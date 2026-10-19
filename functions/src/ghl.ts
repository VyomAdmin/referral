import type { SiteConfig } from "../../config/site.ts";
import { ghlAuthMode } from "../../config/site.ts";
import { resolveStage, type Stage } from "./domain.ts";

export class CrmError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CrmError";
    this.status = status;
  }
}

export class NotConfiguredError extends CrmError {
  constructor() {
    super("CRM is not configured.", 503);
    this.name = "NotConfiguredError";
  }
}

export type ContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string[];
  customFields: Record<string, string>;
};

export type OpportunityInput = {
  contactId: string;
  name: string;
  stage: Stage;
};

export type StageLookup = {
  stage: Stage | null;
  rawStageId: string | null;
  rawStageName: string | null;
};

export type EmailInput = { to: string; subject: string; text: string; contactId?: string };
export type SmsInput = { to: string; body: string; contactId?: string };

export interface Crm {
  upsertContact(input: ContactInput): Promise<{ contactId: string }>;
  createOpportunity(input: OpportunityInput): Promise<{ opportunityId: string }>;
  getOpportunityStage(opportunityId: string): Promise<StageLookup>;
}

export interface Messaging {
  sendEmail(input: EmailInput): Promise<{ messageId: string }>;
  sendSms(input: SmsInput): Promise<{ messageId: string }>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export class UnconfiguredCrm implements Crm, Messaging {
  async upsertContact(): Promise<{ contactId: string }> {
    throw new NotConfiguredError();
  }
  async createOpportunity(): Promise<{ opportunityId: string }> {
    throw new NotConfiguredError();
  }
  async getOpportunityStage(): Promise<StageLookup> {
    throw new NotConfiguredError();
  }
  async sendEmail(): Promise<{ messageId: string }> {
    throw new NotConfiguredError();
  }
  async sendSms(): Promise<{ messageId: string }> {
    throw new NotConfiguredError();
  }
}

export class GhlClient implements Crm, Messaging {
  private accessToken = "";
  private accessExpiresAt = 0;
  private refreshToken: string;
  private config: SiteConfig;
  private fetchImpl: FetchLike;
  private sleep: (ms: number) => Promise<void>;
  private maxAttempts: number;

  constructor(config: SiteConfig, fetchImpl: FetchLike = fetch, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), maxAttempts = 4) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.maxAttempts = maxAttempts;
    this.refreshToken = config.ghlRefreshToken;
  }

  async upsertContact(input: ContactInput) {
    const customFields = Object.entries(input.customFields)
      .map(([key, value]) => {
        const id = this.config.ghlCustomFieldIds[key];
        return id ? { id, field_value: value } : null;
      })
      .filter((field): field is { id: string; field_value: string } => Boolean(field));
    const created = await this.request<{ contact?: { id?: string }; id?: string }>("POST", "/contacts/", {
      locationId: this.config.ghlLocationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      tags: input.tags,
      customFields,
    });
    const contactId = created.contact?.id ?? created.id;
    if (!contactId) throw new CrmError("CRM contact response did not include an id.", 502);
    return { contactId };
  }

  async createOpportunity(input: OpportunityInput) {
    const stageId = this.config.ghlStageIds[input.stage] ?? "";
    const created = await this.request<{ opportunity?: { id?: string }; id?: string }>("POST", "/opportunities/", {
      locationId: this.config.ghlLocationId,
      pipelineId: this.config.ghlPipelineId,
      pipelineStageId: stageId,
      contactId: input.contactId,
      name: input.name,
      status: "open",
    });
    const opportunityId = created.opportunity?.id ?? created.id;
    if (!opportunityId) throw new CrmError("CRM opportunity response did not include an id.", 502);
    return { opportunityId };
  }

  async getOpportunityStage(opportunityId: string): Promise<StageLookup> {
    const body = await this.request<{
      opportunity?: { pipelineStageId?: string; pipelineStageName?: string; stageName?: string };
      pipelineStageId?: string;
      pipelineStageName?: string;
    }>("GET", `/opportunities/${encodeURIComponent(opportunityId)}`);
    const source = body.opportunity ?? body;
    const rawStageId = source.pipelineStageId ?? null;
    const rawStageName = source.pipelineStageName ?? ("stageName" in source ? (source as { stageName?: string }).stageName ?? null : null);
    return {
      stage: resolveStage({ stageName: rawStageName, pipelineStageId: rawStageId }, this.config.ghlStageIds),
      rawStageId,
      rawStageName,
    };
  }

  async sendEmail(input: EmailInput) {
    const body = await this.request<{ messageId?: string; id?: string; emailMessageId?: string }>("POST", "/conversations/messages", {
      type: "Email",
      contactId: input.contactId,
      emailTo: input.to,
      subject: input.subject,
      html: textToHtml(input.text),
      message: input.text,
      emailFrom: this.config.emailFrom || undefined,
    });
    return { messageId: body.messageId ?? body.emailMessageId ?? body.id ?? "sent" };
  }

  async sendSms(input: SmsInput) {
    const body = await this.request<{ messageId?: string; id?: string }>("POST", "/conversations/messages", {
      type: "SMS",
      contactId: input.contactId,
      message: input.body,
    });
    return { messageId: body.messageId ?? body.id ?? "sent" };
  }

  private async request<T>(method: string, path: string, payload?: unknown, attempt = 0): Promise<T> {
    if (ghlAuthMode(this.config) === "unconfigured") throw new NotConfiguredError();
    if ((method === "POST" && (path === "/contacts/" || path === "/opportunities/")) && (!this.config.ghlLocationId || (path === "/opportunities/" && !this.config.ghlPipelineId))) {
      throw new CrmError("CRM location or pipeline is not configured.", 503);
    }
    const headers = await this.authHeaders();
    const response = await this.fetchImpl(`${this.config.ghlApiBase}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (response.status === 429 && attempt + 1 < this.maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const base = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : Math.min(30_000, 500 * 2 ** attempt);
      await this.sleep(base);
      return this.request(method, path, payload, attempt + 1);
    }
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      throw new CrmError(`CRM request failed (${response.status}).`, response.status);
    }
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (this.config.ghlApiVersion) headers.Version = this.config.ghlApiVersion;
    if (this.config.ghlPrivateToken) {
      headers.Authorization = `Bearer ${this.config.ghlPrivateToken}`;
      return headers;
    }
    if (!this.accessToken || Date.now() > this.accessExpiresAt - 60_000) {
      const body = new URLSearchParams({
        client_id: this.config.ghlClientId,
        client_secret: this.config.ghlClientSecret,
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      });
      const response = await this.fetchImpl(`${this.config.ghlApiBase}/oauth/token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const text = await response.text();
      if (response.status < 200 || response.status >= 300) throw new CrmError("CRM token refresh failed.", response.status);
      const parsed = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!parsed.access_token) throw new CrmError("CRM token refresh did not return an access token.", 502);
      this.accessToken = parsed.access_token;
      if (parsed.refresh_token) this.refreshToken = parsed.refresh_token;
      this.accessExpiresAt = Date.now() + (parsed.expires_in ?? 3600) * 1000;
    }
    headers.Authorization = `Bearer ${this.accessToken}`;
    return headers;
  }
}

function textToHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
