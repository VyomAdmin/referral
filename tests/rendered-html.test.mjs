import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function render(pathname) {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { DB: {}, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the NuVision referral registration experience", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Good service is worth sharing/);
  assert.match(html, /Create your referral link/);
  assert.match(html, /Share\. Track\. Get rewarded\./);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the ZIP-gated referred-customer journey", async () => {
  const response = await render("/r/NV-SANDEEP");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Where do you need service/);
  assert.match(html, /Enter your ZIP/);
  assert.match(html, /Your referral is already attached/);
});

test("server-renders the operational dashboard and safe reward language", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Referral operations/);
  assert.match(html, /Rewards outstanding/);
  assert.match(html, /Test mode • HubSpot simulated/);
  assert.match(html, /No CRM writes, emails, or payments are sent/);
});

test("server-renders valid and expired tracker states", async () => {
  const valid = await render("/track/referrer/demo");
  assert.match(await valid.text(), /Your referrals are moving/);
  const expired = await render("/track/customer/expired");
  assert.match(await expired.text(), /tracking link has expired/);
});
