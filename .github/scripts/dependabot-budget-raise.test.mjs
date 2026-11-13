import assert from "node:assert/strict";
import { test } from "node:test";
import { decideBudgetRaise } from "./dependabot-budget-raise.mjs";

const budget = { entry: 100_000, total: 400_000 };

test("decideBudgetRaise leaves the budget alone when the bundle fits it", () => {
  const decision = decideBudgetRaise({ entry: 100_000, total: 399_000, missing: [] }, budget);

  assert.deepEqual(decision, { kind: "within-budget" });
});

test("decideBudgetRaise raises the budget to the measured sizes when the growth fits in 2 KB", () => {
  const decision = decideBudgetRaise({ entry: 100_019, total: 400_105, missing: [] }, budget);

  assert.deepEqual(decision, { kind: "raise", budget: { entry: 100_019, total: 400_105 } });
});

test("decideBudgetRaise raises a measure that grew by exactly 2048 bytes", () => {
  const decision = decideBudgetRaise({ entry: 102_048, total: 402_048, missing: [] }, budget);

  assert.deepEqual(decision, { kind: "raise", budget: { entry: 102_048, total: 402_048 } });
});

test("decideBudgetRaise keeps the measure that did not grow at its measured size when another grew", () => {
  const decision = decideBudgetRaise({ entry: 99_000, total: 400_105, missing: [] }, budget);

  assert.deepEqual(decision, { kind: "raise", budget: { entry: 99_000, total: 400_105 } });
});

for (const [description, measured] of [
  ["the entry", { entry: 102_049, total: 400_000, missing: [] }],
  ["the total", { entry: 100_000, total: 402_049, missing: [] }],
]) {
  test(`decideBudgetRaise refuses to raise when ${description} grew by more than 2 KB`, () => {
    const decision = decideBudgetRaise(measured, budget);

    assert.equal(decision.kind, "over-cap");
    assert.ok(decision.reasons.length > 0);
  });
}

test("decideBudgetRaise refuses to raise when the build lacks a file index.html references", () => {
  const decision = decideBudgetRaise(
    { entry: 100_019, total: 400_105, missing: ["assets/font.woff2"] },
    budget,
  );

  assert.equal(decision.kind, "refused");
  assert.match(decision.reasons.join("\n"), /assets\/font\.woff2/);
});

test("decideBudgetRaise refuses to raise a budget that does not hold exactly the measures", () => {
  const decision = decideBudgetRaise(
    { entry: 100_019, total: 400_105, missing: [] },
    { entry: 100_000 },
  );

  assert.equal(decision.kind, "refused");
});
