export type PublicConfig = {
  legalName: string;
  brandName: string;
  domain: string;
  payoutLine: string;
  offerText: string;
  rewardAmount?: string;
  customerBenefit: string;
  smsConsentText: string;
  privacyText: string;
  termsText: string;
  states: string[];
  active: boolean;
};

export async function getConfig(): Promise<PublicConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error("Configuration could not be loaded.");
  return response.json() as Promise<PublicConfig>;
}

export async function postJson<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T;
  return { status: response.status, body: payload };
}
