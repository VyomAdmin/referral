import assert from "node:assert/strict";
import test from "node:test";
import { brevoEventKey, sendViaBrevo, shouldAdvanceStatus, statusForBrevoEvent } from "../app/lib/brevo.ts";

test("maps Brevo events onto the statuses the admin dashboard counts", () => {
  assert.equal(statusForBrevoEvent("delivered"), "delivered");
  assert.equal(statusForBrevoEvent("unique_opened"), "opened");
  assert.equal(statusForBrevoEvent("opened"), "opened");
  assert.equal(statusForBrevoEvent("click"), "clicked");
  assert.equal(statusForBrevoEvent("hard_bounce"), "bounced");
  assert.equal(statusForBrevoEvent("soft_bounce"), "bounced");
  assert.equal(statusForBrevoEvent("blocked"), "bounced");
  assert.equal(statusForBrevoEvent("invalid_email"), "bounced");
  assert.equal(statusForBrevoEvent("spam"), "bounced");
  assert.equal(statusForBrevoEvent("unsubscribed"), "unsubscribed");
  assert.equal(statusForBrevoEvent("proxy_open"), "opened");
  assert.equal(statusForBrevoEvent("unique_proxy_open"), "opened");
  assert.equal(statusForBrevoEvent("error"), "failed");
});

// Brevo's webhook *config* uses camelCase names (hardBounce, uniqueOpened) but
// the delivered payload's "event" field is snake_case. These are the payload
// spellings, which is what the handler actually receives.
test("every payload event name Brevo can send is either mapped or deliberately ignored", () => {
  const payloadEvents = [
    "request", "delivered", "hard_bounce", "soft_bounce", "blocked", "spam",
    "invalid_email", "deferred", "click", "opened", "unique_opened",
    "proxy_open", "unique_proxy_open", "unsubscribed", "error",
  ];
  const unmapped = payloadEvents.filter((event) => statusForBrevoEvent(event) === null);
  assert.deepEqual(unmapped, ["deferred"]);
});

// A send error has to be able to land on an email we already marked "sent",
// or the failure would never show in the dashboard.
test("a send error outranks sent but not a confirmed delivery", () => {
  assert.equal(shouldAdvanceStatus("sent", "failed"), true);
  assert.equal(shouldAdvanceStatus("delivered", "failed"), false);
  assert.equal(shouldAdvanceStatus("opened", "failed"), false);
});

test("event names are matched case-insensitively", () => {
  assert.equal(statusForBrevoEvent("DELIVERED"), "delivered");
});

// "deferred" is a retry in progress, not an outcome — acting on it would
// downgrade an email that is still on its way.
test("deferred and unknown events map to nothing", () => {
  assert.equal(statusForBrevoEvent("deferred"), null);
  assert.equal(statusForBrevoEvent("something_new"), null);
});

// Webhooks arrive out of order, so this is the guard that stops a late
// "delivered" from silently un-opening an email in the dashboard.
test("status only advances along the delivery funnel", () => {
  assert.equal(shouldAdvanceStatus("sent", "delivered"), true);
  assert.equal(shouldAdvanceStatus("delivered", "opened"), true);
  assert.equal(shouldAdvanceStatus("opened", "clicked"), true);
  assert.equal(shouldAdvanceStatus("opened", "delivered"), false);
  assert.equal(shouldAdvanceStatus("clicked", "opened"), false);
  assert.equal(shouldAdvanceStatus("clicked", "delivered"), false);
});

test("a repeated event of the same status is not reapplied", () => {
  assert.equal(shouldAdvanceStatus("opened", "opened"), false);
  assert.equal(shouldAdvanceStatus("delivered", "delivered"), false);
});

test("a bounce can still land on a freshly sent email", () => {
  assert.equal(shouldAdvanceStatus("sent", "bounced"), true);
  assert.equal(shouldAdvanceStatus("queued", "bounced"), true);
  // ...but never over a confirmed delivery.
  assert.equal(shouldAdvanceStatus("delivered", "bounced"), false);
});

test("the request event never overwrites a recorded status", () => {
  assert.equal(shouldAdvanceStatus("sent", "sent"), false);
  assert.equal(shouldAdvanceStatus("queued", "sent"), false);
});

test("an unrecognised stored status is treated as the floor so webhooks still apply", () => {
  assert.equal(shouldAdvanceStatus("something-hand-edited", "delivered"), true);
});

// Provider retries of one delivery must collapse; genuinely repeated events
// (several opens of the same email) must not.
test("event keys dedupe provider retries but keep distinct events", () => {
  const base = { event: "opened", "message-id": "<a@brevo>", id: 1, ts: 100 };
  assert.equal(brevoEventKey(base), brevoEventKey({ ...base }));
  assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, ts: 200 }));
  assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, event: "click" }));
  assert.notEqual(brevoEventKey(base), brevoEventKey({ ...base, "message-id": "<b@brevo>" }));
});

test("sendViaBrevo posts the transactional payload and returns the messageId", async () => {
  let capturedBody: Record<string, unknown> = {};
  const result = await sendViaBrevo(
    {
      apiKey: "xkeysib-test",
      senderEmail: "referrals@nuvisionautoglass.com",
      senderName: "NuVision Auto Glass",
      to: "customer@example.com",
      subject: "Your referral",
      html: "<p>Hello</p>",
      text: "Hello",
      tag: "referrer_welcome",
    },
    (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ messageId: "<msg@brevo>" }), { status: 201 });
    }) as unknown as typeof fetch,
  );

  assert.deepEqual(result, { ok: true, providerMessageId: "<msg@brevo>" });
  assert.equal(capturedBody.subject, "Your referral");
  assert.equal(capturedBody.htmlContent, "<p>Hello</p>");
  assert.equal(capturedBody.textContent, "Hello");
});

test("sendViaBrevo reports a network failure instead of throwing", async () => {
  const result = await sendViaBrevo(
    { apiKey: "k", senderEmail: "a@b.com", senderName: "N", to: "c@d.com", subject: "s", html: "<p>h</p>" },
    (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch,
  );
  assert.deepEqual(result, { ok: false, error: "socket hang up" });
});

test("sendViaBrevo treats an accepted send with no messageId as a failure", async () => {
  const result = await sendViaBrevo(
    { apiKey: "k", senderEmail: "a@b.com", senderName: "N", to: "c@d.com", subject: "s", html: "<p>h</p>" },
    (async () => new Response("{}", { status: 201 })) as unknown as typeof fetch,
  );
  assert.deepEqual(result, { ok: false, error: "Brevo accepted the send but returned no messageId" });
});
