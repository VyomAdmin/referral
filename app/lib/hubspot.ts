export type PublicReferralStatus = "received" | "scheduled" | "installed" | "paid";

export type HubSpotDealSnapshot = {
  dealStage: string;
  installationCompleted: boolean;
  installationCompletedAt?: string | null;
  rewardPaid: boolean;
};

export type HubSpotWebhookEvent = {
  eventId: number | string;
  subscriptionId: number | string;
  portalId: number | string;
  occurredAt: number;
  subscriptionType: string;
  objectId: number | string;
  propertyName?: string;
  propertyValue?: string;
};

export function mapHubSpotDealToPublicStatus(snapshot: HubSpotDealSnapshot): PublicReferralStatus {
  if (snapshot.rewardPaid && snapshot.installationCompleted && snapshot.installationCompletedAt) return "paid";
  if (snapshot.installationCompleted && snapshot.installationCompletedAt) return "installed";
  if (/appointment|scheduled|closedwon|closed won/i.test(snapshot.dealStage)) return "scheduled";
  return "received";
}

export function hubSpotEventKey(event: HubSpotWebhookEvent) {
  return `${event.portalId}:${event.subscriptionId}:${event.eventId}:${event.occurredAt}`;
}

export const INSTALLATION_COMPLETED_PROPERTY = "status_code__c";
export const INSTALLATION_COMPLETED_VALUE = "Install Completed";

function normalizedHubSpotUri(uri: string) {
  const decodes: Record<string, string> = { "%3A": ":", "%2F": "/", "%3F": "?", "%40": "@", "%21": "!", "%24": "$", "%27": "'", "%28": "(", "%29": ")", "%2A": "*", "%2C": ",", "%3B": ";" };
  return Object.entries(decodes).reduce((value, [encoded, decoded]) => value.replace(new RegExp(encoded, "gi"), decoded), uri);
}

function bytesToBase64(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function createHubSpotV3Signature(secret: string, method: string, uri: string, body: string, timestamp: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const source = `${method.toUpperCase()}${normalizedHubSpotUri(uri)}${body}${timestamp}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source));
  return bytesToBase64(signature);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function validateHubSpotV3Signature(input: { secret: string; method: string; uri: string; body: string; timestamp: string; signature: string; now?: number }) {
  const receivedAt = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(receivedAt) || Math.abs(now - receivedAt) > 5 * 60 * 1000) return false;
  const expected = await createHubSpotV3Signature(input.secret, input.method, input.uri, input.body, input.timestamp);
  return constantTimeEqual(expected, input.signature);
}
