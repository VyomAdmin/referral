import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import { sendSms } from "../app/lib/sms-sender.ts";

const ORIGINAL_SID = process.env.TWILIO_ACCOUNT_SID;
const ORIGINAL_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const ORIGINAL_FROM = process.env.TWILIO_FROM_NUMBER;

afterEach(() => {
  mock.reset();
  process.env.TWILIO_ACCOUNT_SID = ORIGINAL_SID;
  process.env.TWILIO_AUTH_TOKEN = ORIGINAL_TOKEN;
  process.env.TWILIO_FROM_NUMBER = ORIGINAL_FROM;
});

test("sendSms no-ops when Twilio credentials aren't configured", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  const fetchMock = mock.method(globalThis, "fetch");
  const result = await sendSms({ to: "+16025550123", body: "Hi" });
  assert.deepEqual(result, { ok: false, error: "Twilio SMS sending is not configured" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("sendSms returns the Twilio message sid on success", async () => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));
  const result = await sendSms({ to: "+16025550123", body: "Hi" });
  assert.deepEqual(result, { ok: true, providerMessageId: "SM123" });
});

test("sendSms surfaces a non-2xx Twilio response as ok:false with the API message", async () => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "The 'To' number is not a valid phone number." }), { status: 400 }));
  const result = await sendSms({ to: "not-a-number", body: "Hi" });
  assert.deepEqual(result, { ok: false, error: "Twilio API failed with 400: The 'To' number is not a valid phone number." });
});

test("sendSms posts To/From/Body as form-encoded with basic auth", async () => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  let capturedUrl = "";
  let capturedBody = "";
  let capturedAuth = "";
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedBody = init.body as string;
    capturedAuth = (init.headers as Record<string, string>).Authorization;
    return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
  });
  await sendSms({ to: "+16025550123", body: "Your link is ready" });
  assert.match(capturedUrl, /\/Accounts\/AC_test\/Messages\.json$/);
  assert.equal(capturedAuth, `Basic ${Buffer.from("AC_test:token").toString("base64")}`);
  const params = new URLSearchParams(capturedBody);
  assert.equal(params.get("To"), "+16025550123");
  assert.equal(params.get("From"), "+15550001111");
  assert.equal(params.get("Body"), "Your link is ready");
});
