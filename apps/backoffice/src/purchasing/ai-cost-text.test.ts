import { expect, test } from "vitest";
import { incompleteAiCostText } from "./ai-cost-text";

test("says nothing of a cost every call of which was priced", () => {
  expect(incompleteAiCostText({ costNanoUsd: 500, unpricedCalls: 0 })).toBeUndefined();
});

test("says the cost is incomplete and how many calls had no price", () => {
  expect(incompleteAiCostText({ costNanoUsd: 500, unpricedCalls: 1 })).toBe(
    "Incompleto: 1 llamada sin precio",
  );
  expect(incompleteAiCostText({ costNanoUsd: 500, unpricedCalls: 1_200 })).toBe(
    "Incompleto: 1.200 llamadas sin precio",
  );
});
