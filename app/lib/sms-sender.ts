export type SendSmsInput = { to: string; body: string };
export type SendResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const REQUEST_TIMEOUT_MS = 8000;

// Plain REST call instead of the Twilio SDK — the Messages API is one POST
// endpoint, not worth a dependency. TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER
// unset => no-ops with an explicit "not configured" result (built ahead of
// having real credentials, same pattern as the other provider integrations).
export async function sendSms(input: SendSmsInput): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "Twilio SMS sending is not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: input.to, From: fromNumber, Body: input.body }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: `Twilio API failed with ${response.status}: ${data.message ?? "unknown error"}` };
    }
    return { ok: true, providerMessageId: data.sid };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown SMS send failure" };
  } finally {
    clearTimeout(timeout);
  }
}
