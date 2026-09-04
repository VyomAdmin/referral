import assert from "node:assert/strict";
import test from "node:test";

const serverUrl = new URL("../dist/server/index.js", import.meta.url);
serverUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: handleRequest } = await import(serverUrl.href);

async function render(pathname) {
  return handleRequest(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
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
  const response = await render("/r/NV-NUVISION");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Where do you need service/);
  assert.match(html, /Enter your ZIP/);
  assert.match(html, /Your referral is already attached/);
  // NV-NUVISION is the generic "I was referred" entry point linked from the
  // nav, homepage, and demo tour — it's never a real referrer row, so the
  // referral-code validation added for audit item B-01 must always exempt it.
  assert.doesNotMatch(html, /isn't valid/);
});

test("redirects unauthenticated visitors away from the admin dashboard", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/admin\/login\?/);
});

// Tracker token verification and the authenticated admin dashboard now query Postgres
// (see app/lib/tracker-tokens.ts, app/lib/auth.ts) instead of matching a hardcoded
// "demo"/"expired" string. This suite has no DATABASE_URL/live DB, so those paths are
// covered by unit tests in tests/auth.test.ts (hash/expiry logic) and must be exercised
// manually against a real database (see plan verification steps) rather than here.
