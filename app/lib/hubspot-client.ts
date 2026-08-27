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

export type HubSpotContactInput = { firstName: string; lastName: string; email: string; phone: string; leadSource: string };

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
  dealName: string;
  pipeline: string;
  dealstage: string;
  leadSource: string;
  contactPhone: string;
  installState: string;
  installZip: string;
  vehicleYear?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  insuranceProvider?: string | null;
};

export async function createDeal(input: HubSpotDealInput): Promise<{ id: string; stage: string }> {
  const result = await hubSpotFetch("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: input.dealName,
        pipeline: input.pipeline,
        dealstage: input.dealstage,
        incoming_lead_source__c: input.leadSource,
        contact_phone_1__c: input.contactPhone,
        install_state: input.installState,
        install_zip: input.installZip,
        ...(input.vehicleYear ? { year__c: input.vehicleYear } : {}),
        ...(input.vehicleMake ? { veh_make__c: input.vehicleMake } : {}),
        ...(input.vehicleModel ? { model__c: input.vehicleModel } : {}),
        ...(input.insuranceProvider ? { insurance_provider_2: input.insuranceProvider } : {}),
      },
      associations: [
        {
          to: { id: input.contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
        },
      ],
    }),
  });
  return { id: result.id, stage: result.properties?.dealstage ?? input.dealstage };
}
