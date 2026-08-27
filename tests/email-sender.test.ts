import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import nodemailer from "nodemailer";
import { sendEmail } from "../app/lib/email-sender.ts";

const ORIGINAL_USER = process.env.GMAIL_SENDER_EMAIL;
const ORIGINAL_PASS = process.env.GMAIL_APP_PASSWORD;

afterEach(() => {
  mock.reset();
  process.env.GMAIL_SENDER_EMAIL = ORIGINAL_USER;
  process.env.GMAIL_APP_PASSWORD = ORIGINAL_PASS;
});

test("sendEmail no-ops when Gmail credentials aren't configured", async () => {
  delete process.env.GMAIL_SENDER_EMAIL;
  delete process.env.GMAIL_APP_PASSWORD;
  const fetchMock = mock.method(nodemailer, "createTransport");
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "Gmail sending is not configured" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("sendEmail returns the provider message id on success", async () => {
  process.env.GMAIL_SENDER_EMAIL = "sender@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => ({ messageId: "msg-123" }),
  }));
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: true, providerMessageId: "msg-123" });
});

test("sendEmail surfaces a send failure as ok:false instead of throwing", async () => {
  process.env.GMAIL_SENDER_EMAIL = "sender@example.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => { throw new Error("SMTP connection refused"); },
  }));
  const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(result, { ok: false, error: "SMTP connection refused" });
});
