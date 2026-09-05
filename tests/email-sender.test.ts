import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import nodemailer from "nodemailer";
import { configuredEmailProvider, sendEmail } from "../app/lib/email-sender.ts";

const ORIGINAL = {
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME,
  GMAIL_AUTH_EMAIL: process.env.GMAIL_AUTH_EMAIL,
  GMAIL_FROM_EMAIL: process.env.GMAIL_FROM_EMAIL,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
};

function clearProviderEnv() {
  for (const key of Object.keys(ORIGINAL)) delete process.env[key];
}

afterEach(() => {
  mock.reset();
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("sendEmail no-ops when no provider is configured", async () => {
  clearProviderEnv();
  const transport = mock.method(nodemailer, "createTransport");
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "No transactional email provider is configured" });
  assert.equal(transport.mock.callCount(), 0);
});

// Brevo wins when both are set, so adding the key to production cuts over
// without a gap — and Gmail keeps working until then.
test("Brevo takes precedence over Gmail when both are configured", () => {
  clearProviderEnv();
  process.env.GMAIL_AUTH_EMAIL = "inbox@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  assert.equal(configuredEmailProvider(), "gmail");
  process.env.BREVO_API_KEY = "xkeysib-test";
  assert.equal(configuredEmailProvider(), "brevo");
});

test("sendEmail posts to Brevo with the verified sender and returns its messageId", async () => {
  clearProviderEnv();
  process.env.BREVO_API_KEY = "xkeysib-test";
  process.env.BREVO_SENDER_EMAIL = "referrals@nuvisionautoglass.com";
  process.env.BREVO_SENDER_NAME = "NuVision Referrals";

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ messageId: "<202609.brevo@smtp>" }), { status: 201 });
  });

  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", tag: "referrer_welcome" });
  assert.deepEqual(result, { ok: true, providerMessageId: "<202609.brevo@smtp>", provider: "brevo" });
  assert.equal(capturedUrl, "https://api.brevo.com/v3/smtp/email");
  assert.equal((capturedInit?.headers as Record<string, string>)["api-key"], "xkeysib-test");

  const body = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(body.sender, { email: "referrals@nuvisionautoglass.com", name: "NuVision Referrals" });
  assert.deepEqual(body.to, [{ email: "a@example.com" }]);
  assert.deepEqual(body.tags, ["referrer_welcome"]);
});

test("sendEmail surfaces a Brevo API error as ok:false instead of throwing", async () => {
  clearProviderEnv();
  process.env.BREVO_API_KEY = "xkeysib-test";
  process.env.BREVO_SENDER_EMAIL = "referrals@nuvisionautoglass.com";
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 }),
  );
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "Brevo send failed (401): unauthorized: Key not found" });
});

test("sendEmail reports a missing Brevo sender rather than sending from nowhere", async () => {
  clearProviderEnv();
  process.env.BREVO_API_KEY = "xkeysib-test";
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 201 }));
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "BREVO_SENDER_EMAIL is not set" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

// --- legacy Gmail path, kept until the Brevo key is verified in production ---

test("Gmail authenticates as GMAIL_AUTH_EMAIL and defaults the From address to it", async () => {
  clearProviderEnv();
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  let capturedAuthUser = "";
  let capturedFrom = "";
  mock.method(nodemailer, "createTransport", (options: { auth: { user: string } }) => {
    capturedAuthUser = options.auth.user;
    return { sendMail: async (mail: { from: string }) => { capturedFrom = mail.from; return { messageId: "msg-123" }; } };
  });
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: true, providerMessageId: "msg-123", provider: "gmail" });
  assert.equal(capturedAuthUser, "real-inbox@example.com");
  assert.equal(capturedFrom, "real-inbox@example.com");
});

test("Gmail sends as the branded alias while still authenticating as the real mailbox", async () => {
  clearProviderEnv();
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  process.env.GMAIL_FROM_EMAIL = "referrals@nuvisionautoglass.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  let capturedFrom = "";
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (mail: { from: string }) => { capturedFrom = mail.from; return { messageId: "msg-456" }; },
  }));
  await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.equal(capturedFrom, "referrals@nuvisionautoglass.com");
});

test("Gmail surfaces a send failure as ok:false instead of throwing", async () => {
  clearProviderEnv();
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => { throw new Error("SMTP connection refused"); },
  }));
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "SMTP connection refused" });
});
