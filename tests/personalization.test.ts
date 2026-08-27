import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "../app/lib/personalization.ts";

test("renderTemplate substitutes known tokens", () => {
  const result = renderTemplate("Hi {{first_name}}, you earned ${{reward_amount}}.", { first_name: "Jane", reward_amount: "50" });
  assert.equal(result, "Hi Jane, you earned $50.");
});

test("renderTemplate tolerates whitespace inside the token braces", () => {
  const result = renderTemplate("Hi {{ first_name }}!", { first_name: "Jane" });
  assert.equal(result, "Hi Jane!");
});

test("renderTemplate leaves unrecognized tokens as literal text instead of blanking them", () => {
  const result = renderTemplate("Hi {{first_name}}, {{unknown_token}} today.", { first_name: "Jane" });
  assert.equal(result, "Hi Jane, {{unknown_token}} today.");
});

test("renderTemplate substitutes every occurrence of a repeated token", () => {
  const result = renderTemplate("{{first_name}} {{first_name}}", { first_name: "Jane" });
  assert.equal(result, "Jane Jane");
});
