const HUBSPOT_API_BASE = "https://api.hubapi.com";
const REQUEST_TIMEOUT_MS = 8000;

export class HubSpotApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function hubSpotFetch(path: string, init: RequestInit) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new HubSpotApiError("HubSpot is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HubSpotApiError(`HubSpot API ${path} failed with ${response.status}: ${body}`, response.status);
  }
  return response.json();
}

export async function getDealProperties(dealId: string, propertyNames: string[]): Promise<Record<string, string | null>> {
  const query = new URLSearchParams({ properties: propertyNames.join(",") });
  const result = await hubSpotFetch(`/crm/v3/objects/deals/${dealId}?${query}`, { method: "GET" });
  return result.properties ?? {};
}

export type HubSpotContactInput = { firstName: string; lastName: string; email: string; phone: string; leadSource: string; secondaryLeadSource: string; referralCode: string };

export async function findContactByEmailOrPhone(email: string, phone: string): Promise<string | null> {
  const result = await hubSpotFetch("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
      ],
      limit: 1,
    }),
  });
  return result.results?.[0]?.id ?? null;
}

// HubSpot's own duplicate-detection (email uniqueness) is broader than our
// findContactByEmailOrPhone lookup (e.g. a contact created outside this app,
// or matched on a normalized email our exact-match query missed). Without
// this, that mismatch makes createContact fail with a 409 on every single
// retry forever — findContactByEmailOrPhone finds nothing, createContact
// hits the same conflict, and the referral is stuck "failed" no matter how
// many times an admin clicks retry. HubSpot's conflict body names the
// existing contact's id, so recover it and use that instead of throwing.
const HUBSPOT_EXISTING_ID_PATTERN = /Existing ID:\s*(\d+)/i;

export async function createContact(input: HubSpotContactInput): Promise<string> {
  try {
    const result = await hubSpotFetch("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          firstname: input.firstName,
          lastname: input.lastName,
          email: input.email,
          phone: input.phone,
          incoming_lead_source__c: input.leadSource,
          lead_source__c: input.secondaryLeadSource,
          referral_code__c: input.referralCode,
        },
      }),
    });
    return result.id;
  } catch (error) {
    if (error instanceof HubSpotApiError && error.status === 409) {
      const existingId = error.message.match(HUBSPOT_EXISTING_ID_PATTERN)?.[1];
      if (existingId) return existingId;
    }
    throw error;
  }
}

const dealStageLabelCache = new Map<string, Map<string, string>>();

async function loadPipelineStageLabels(pipelineId: string): Promise<Map<string, string>> {
  const cached = dealStageLabelCache.get(pipelineId);
  if (cached) return cached;

  const result = await hubSpotFetch(`/crm/v3/pipelines/deals/${pipelineId}`, { method: "GET" });
  const labels = new Map<string, string>((result.stages ?? []).map((stage: { id: string; label: string }) => [stage.id, stage.label]));
  dealStageLabelCache.set(pipelineId, labels);
  return labels;
}

// The dealstage property holds HubSpot's opaque numeric stage id, not the label
// shown in the HubSpot UI. Resolve it once per pipeline and cache the mapping
// so referrals display "New" instead of "1012021141". Falls back to the raw id
// if the lookup fails — a display nicety is never worth breaking a sync over.
export async function getDealStageLabel(pipelineId: string, stageId: string): Promise<string> {
  try {
    const labels = await loadPipelineStageLabels(pipelineId);
    return labels.get(stageId) ?? stageId;
  } catch {
    return stageId;
  }
}

export type HubSpotDealInput = {
  contactId: string;
  // The referrer's own HubSpot contact, associated on the deal alongside the
  // customer contact so the referrer shows up on the deal's timeline too —
  // per the audit, a referral deal previously carried no referrer attribution
  // at all beyond a free-text property. Omitted when it's the same contact
  // (e.g. lookup collision) or couldn't be resolved.
  referrerContactId?: string;
  dealName: string;
  pipeline: string;
  dealstage: string;
  leadSource: string;
  secondaryLeadSource: string;
  referralCode: string;
  referredByName: string;
  referredByEmail: string;
  referredByPhone: string;
  contactPhone: string;
  // Already-resolved property values (see resolvePicklistValue) — e.g.
  // { install_state: "Arizona", veh_make__c: "Toyota" }.
  extraProperties?: Record<string, string>;
  // Free text for anything that couldn't be placed in a picklist property.
  installNotes?: string;
};

export async function createDeal(input: HubSpotDealInput): Promise<{ id: string; stage: string }> {
  const contactAssociationType = [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }];
  const associations = [{ to: { id: input.contactId }, types: contactAssociationType }];
  if (input.referrerContactId && input.referrerContactId !== input.contactId) {
    associations.push({ to: { id: input.referrerContactId }, types: contactAssociationType });
  }

  const result = await hubSpotFetch("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: input.dealName,
        pipeline: input.pipeline,
        dealstage: input.dealstage,
        incoming_lead_source__c: input.leadSource,
        lead_source__c: input.secondaryLeadSource,
        referral_code__c: input.referralCode,
        // Legacy duplicate of referral_code__c still read by older reports/
        // workflows in this HubSpot portal (per the cutover audit) — kept in
        // sync so nothing downstream silently sees an empty value.
        referralcode: input.referralCode,
        referred_by: input.referredByName,
        referral_email__c: input.referredByEmail,
        referral_phone__c: input.referredByPhone,
        contact_phone_1__c: input.contactPhone,
        ...input.extraProperties,
        ...(input.installNotes ? { install_notes__c: input.installNotes } : {}),
      },
      associations,
    }),
  });
  return { id: result.id, stage: result.properties?.dealstage ?? input.dealstage };
}

export type HubSpotPropertyOption = { label: string; value: string };
export type HubSpotPropertyDefinition = { name: string; label: string; type: string; options: HubSpotPropertyOption[] };

const propertyDefinitionCache = new Map<string, HubSpotPropertyDefinition | null>();

async function getPropertyDefinition(objectType: string, propertyName: string): Promise<HubSpotPropertyDefinition | null> {
  const cacheKey = `${objectType}:${propertyName}`;
  if (propertyDefinitionCache.has(cacheKey)) return propertyDefinitionCache.get(cacheKey) ?? null;

  try {
    const result = await hubSpotFetch(`/crm/v3/properties/${objectType}/${propertyName}`, { method: "GET" });
    const definition: HubSpotPropertyDefinition = {
      name: result.name,
      label: result.label ?? propertyName,
      type: result.type,
      options: Array.isArray(result.options) ? result.options.map((option: { label: string; value: string }) => ({ label: option.label, value: option.value })) : [],
    };
    propertyDefinitionCache.set(cacheKey, definition);
    return definition;
  } catch {
    // A metadata lookup failing shouldn't be fatal — resolvePicklistValue's
    // "not-a-picklist" fallback lets the caller send the raw value as-is,
    // same tradeoff as getDealStageLabel falling back to the raw stage id.
    propertyDefinitionCache.set(cacheKey, null);
    return null;
  }
}

export type PicklistResolution =
  | { kind: "not-a-picklist" }
  | { kind: "matched"; value: string }
  | { kind: "unmatched"; fieldLabel: string };

// Picklist (enumeration) properties reject any value that isn't exactly one of
// their defined options — a customer typing "toyota" against a "Toyota"
// option, or a value HubSpot doesn't recognize at all, would otherwise fail
// the whole deal create. Match case-insensitively against both the option's
// internal value and its display label, and report back rather than guess
// when there's no match, so the caller can route it to a notes field instead.
export async function resolvePicklistValue(objectType: string, propertyName: string, rawValue: string): Promise<PicklistResolution> {
  const definition = await getPropertyDefinition(objectType, propertyName);
  if (!definition || definition.type !== "enumeration") return { kind: "not-a-picklist" };

  const needle = rawValue.trim().toLowerCase();
  const match = definition.options.find((option) => option.value.toLowerCase() === needle || option.label.toLowerCase() === needle);
  return match ? { kind: "matched", value: match.value } : { kind: "unmatched", fieldLabel: definition.label };
}
