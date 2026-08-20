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

export type HubSpotContactInput = { firstName: string; lastName: string; email: string; phone: string };

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

export async function createContact(input: HubSpotContactInput): Promise<string> {
  const result = await hubSpotFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        firstname: input.firstName,
        lastname: input.lastName,
        email: input.email,
        phone: input.phone,
      },
    }),
  });
  return result.id;
}

export type HubSpotDealInput = { contactId: string; dealName: string; pipeline: string; dealstage: string; leadSource: string };

export async function createDeal(input: HubSpotDealInput): Promise<{ id: string; stage: string }> {
  const result = await hubSpotFetch("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: input.dealName,
        pipeline: input.pipeline,
        dealstage: input.dealstage,
        incoming_lead_source__c: input.leadSource,
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
