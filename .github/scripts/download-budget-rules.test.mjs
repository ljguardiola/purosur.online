import assert from "node:assert/strict";
import { test } from "node:test";
import { findBudgetViolations } from "./download-budget-rules.mjs";

test("findBudgetViolations is empty while both sizes are within their budgets", () => {
  const violations = findBudgetViolations(
    { entry: 100, total: 300, missing: [] },
    { entry: 100, total: 300 },
  );

  assert.deepEqual(violations, []);
});

test("findBudgetViolations names the measure that is over budget", () => {
  const violations = findBudgetViolations(
    { entry: 101, total: 300, missing: [] },
    { entry: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /entry/);
  assert.match(violations[0], /101/);
  assert.match(violations[0], /100/);
});

test("findBudgetViolations names a file that index.html references and the build lacks", () => {
  const violations = findBudgetViolations(
    { entry: 1, total: 1, missing: ["assets/font.woff2"] },
    { entry: 100, total: 300 },
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0], /assets\/font\.woff2/);
});

for (const [description, budget] of [
  ["lacks a measure", { total: 300 }],
  ["misspells a measure", { entri: 100, total: 300 }],
  ["holds an unknown measure", { entry: 100, total: 300, fonts: 50 }],
  ["holds a measure that is not a number", { entry: "100", total: 300 }],
  ["holds a measure that is not an integer", { entry: 100.5, total: 300 }],
  ["holds a measure that is not positive", { entry: 0, total: 300 }],
  ["is not an object", [100, 300]],
]) {
  test(`findBudgetViolations rejects a budget that ${description}`, () => {
    const violations = findBudgetViolations({ entry: 1, total: 1, missing: [] }, budget);

    assert.equal(violations.length, 1);
    assert.match(violations[0], /entry/);
    assert.match(violations[0], /total/);
  });
}
