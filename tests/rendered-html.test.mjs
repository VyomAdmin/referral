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

// R-04: the vehicle make dropdown is built from the main site's own
// car-makes.json, so the referral form and the main quote form offer exactly the
// same vehicles. Asserted against the built client bundle rather than the
// server-rendered HTML, because the vehicle step only renders after a ZIP is
// entered. The full cars.json (~680KB) must stay OUT of every client chunk — it
// is fetched from /cars.json on demand when a make is chosen.
test("the make list ships in the client bundle and the full catalogue does not", async () => {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const chunkDir = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const names = await readdir(chunkDir);
  const journey = names.find((name) => name.startsWith("referral-journey-"));
  assert.ok(journey, "referral-journey chunk not found");

  const bundle = await readFile(new URL(journey, chunkDir), "utf8");
  assert.match(bundle, /Mercedes-Benz/);
  assert.match(bundle, /McLaren/);
  assert.match(bundle, /Choose your car make/);

  // Every chunk stays well under the size the full catalogue would force.
  for (const name of names) {
    const { size } = await stat(new URL(name, chunkDir));
    assert.ok(size < 300_000, `${name} is ${size} bytes — cars.json may have been bundled`);
  }
});

// The on-demand catalogue has to actually be served, or the model dropdown
// silently degrades to free text for every customer.
test("the full vehicle catalogue is served as a static asset", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(new URL("../dist/client/cars.json", import.meta.url), "utf8");
  const catalogue = JSON.parse(raw);
  assert.ok(Array.isArray(catalogue.data) && catalogue.data.length > 40);
  assert.ok(catalogue.data.some((entry) => entry.make === "RAM"));
});
