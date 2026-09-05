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

// Cutover audit R-06/R-07/R-08: the referee page had no phone number, an empty
// sidebar, and a developer placeholder ("Try 85001 for Arizona...") shipping to
// customers. All three are checked on the server-rendered HTML so a regression
// can't hide behind client hydration.
test("the referred-customer page carries the call-now number, trust signals, and no dev placeholder", async () => {
  const response = await render("/r/NV-NUVISION");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /1855-213-0100/);
  assert.match(html, /tel:\+18552130100/);
  assert.match(html, /Lifetime warranty/);
  assert.match(html, /Same-day mobile service/);
  assert.doesNotMatch(html, /Try 85001 for Arizona/);
});

// R-01: every input needs a name and an id for autofill and GTM field tracking.
test("the ZIP form input is named and labelled", async () => {
  const response = await render("/r/NV-NUVISION");
  const html = await response.text();
  assert.match(html, /name="zip"/);
  assert.match(html, /id="referral-zip"/);
  assert.match(html, /for="referral-zip"/);
});

// C-01/C-02: consent has to link the actual policies and disclose message terms
// for the consent to be provable.
test("the referrer signup consent copy links the policies and discloses message terms", async () => {
  const response = await render("/");
  const html = await response.text();
  assert.match(html, /nuvisionautoglass\.com\/terms-conditions\//);
  assert.match(html, /nuvisionautoglass\.com\/privacy-policy\//);
  assert.match(html, /Message and data rates may apply/);
  assert.match(html, /Reply STOP to opt out/);
});

// Content rewrite: Florida has no customer-side offer, and a card that exists
// only to say so reads as an exclusion. The whole block must be absent, not
// filled with a negative.
test("no 'no offer is active' copy ships anywhere in the referee flow", async () => {
  const response = await render("/r/NV-NUVISION");
  const html = await response.text();
  assert.doesNotMatch(html, /No additional customer offer is active/);
  assert.doesNotMatch(html, /LOCAL SERVICE/);
});
