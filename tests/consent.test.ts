import assert from "node:assert/strict";
import test from "node:test";
import { CONSENT_LINK_LABELS, REFERRER_CONSENT_TEMPLATE, REFERRER_CONSENT_VERSION, referrerConsentSegments, referrerConsentText } from "../app/lib/consent.ts";

// The stored consent record and the on-screen wording come from one string, so
// they cannot drift. These guard that the split/rejoin is lossless — a bug here
// would mean storing text the referrer never actually saw.
test("segments rejoin into exactly the rendered consent text", () => {
  const rejoined = referrerConsentSegments()
    .map((segment) => (segment.type === "text" ? segment.value : segment.label))
    .join("");
  assert.equal(rejoined, referrerConsentText());
});

test("both policy links are rendered as links, not left as raw placeholders", () => {
  const segments = referrerConsentSegments();
  const slots = segments.filter((s) => s.type === "link").map((s) => (s.type === "link" ? s.slot : ""));
  assert.deepEqual(slots, ["terms", "privacy"]);
  assert.doesNotMatch(referrerConsentText(), /\{terms\}|\{privacy\}/);
});

test("consent text carries the terms, age, permission and messaging disclosures", () => {
  const text = referrerConsentText();
  assert.match(text, new RegExp(CONSENT_LINK_LABELS.terms));
  assert.match(text, new RegExp(CONSENT_LINK_LABELS.privacy));
  assert.match(text, /18 or older/);
  assert.match(text, /permission/i);
  assert.match(text, /Message and data rates may apply/);
  assert.match(text, /Reply STOP to opt out/);
});

// Old rows keep the wording they agreed to, so the version has to move whenever
// the wording does.
test("the consent version is a dated, sortable stamp", () => {
  assert.match(REFERRER_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(REFERRER_CONSENT_TEMPLATE.length > 100);
});
