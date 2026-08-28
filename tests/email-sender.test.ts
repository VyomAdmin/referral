import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import nodemailer from "nodemailer";
import { sendEmail } from "../app/lib/email-sender.ts";

const ORIGINAL_AUTH_EMAIL = process.env.GMAIL_AUTH_EMAIL;
const ORIGINAL_FROM_EMAIL = process.env.GMAIL_FROM_EMAIL;
const ORIGINAL_PASS = process.env.GMAIL_APP_PASSWORD;

afterEach(() => {
  mock.reset();
  process.env.GMAIL_AUTH_EMAIL = ORIGINAL_AUTH_EMAIL;
  process.env.GMAIL_FROM_EMAIL = ORIGINAL_FROM_EMAIL;
  process.env.GMAIL_APP_PASSWORD = ORIGINAL_PASS;
});

test("sendEmail no-ops when Gmail credentials aren't configured", async () => {
  delete process.env.GMAIL_AUTH_EMAIL;
  delete process.env.GMAIL_APP_PASSWORD;
  const fetchMock = mock.method(nodemailer, "createTransport");
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "Gmail sending is not configured" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("sendEmail authenticates as GMAIL_AUTH_EMAIL but defaults the From address to it when GMAIL_FROM_EMAIL is unset", async () => {
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  delete process.env.GMAIL_FROM_EMAIL;
  process.env.GMAIL_APP_PASSWORD = "app-password";
  let capturedAuthUser = "";
  let capturedFrom = "";
  mock.method(nodemailer, "createTransport", (options: { auth: { user: string } }) => {
    capturedAuthUser = options.auth.user;
    return { sendMail: async (mail: { from: string }) => { capturedFrom = mail.from; return { messageId: "msg-123" }; } };
  });
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: true, providerMessageId: "msg-123" });
  assert.equal(capturedAuthUser, "real-inbox@example.com");
  assert.equal(capturedFrom, "real-inbox@example.com");
});

test("sendEmail sends as the branded alias in GMAIL_FROM_EMAIL while still authenticating as the real mailbox", async () => {
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  process.env.GMAIL_FROM_EMAIL = "referrals@nuvisionautoglass.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  let capturedAuthUser = "";
  let capturedFrom = "";
  mock.method(nodemailer, "createTransport", (options: { auth: { user: string } }) => {
    capturedAuthUser = options.auth.user;
    return { sendMail: async (mail: { from: string }) => { capturedFrom = mail.from; return { messageId: "msg-456" }; } };
  });
  await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.equal(capturedAuthUser, "real-inbox@example.com");
  assert.equal(capturedFrom, "referrals@nuvisionautoglass.com");
});

test("sendEmail surfaces a send failure as ok:false instead of throwing", async () => {
  process.env.GMAIL_AUTH_EMAIL = "real-inbox@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => { throw new Error("SMTP connection refused"); },
  }));
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "SMTP connection refused" });
});
