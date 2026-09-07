import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_SECTIONS } from "../app/lib/admin-sections.ts";

// The /admin/[section] route validates its URL segment against this list and
// the dashboard nav renders from it, so the two can't disagree about what a
// section is.
test("the admin section list covers every dashboard view", () => {
  assert.ok(Array.isArray(ADMIN_SECTIONS));
  assert.equal(ADMIN_SECTIONS[0], "overview", "overview must be first — it's the /admin root view");
  for (const section of ["referrals", "campaigns", "templates", "rewards", "emails", "analytics", "integrations", "settings"]) {
    assert.ok(ADMIN_SECTIONS.includes(section as (typeof ADMIN_SECTIONS)[number]), `missing section: ${section}`);
  }
  assert.equal(new Set(ADMIN_SECTIONS).size, ADMIN_SECTIONS.length, "duplicate section");
});
