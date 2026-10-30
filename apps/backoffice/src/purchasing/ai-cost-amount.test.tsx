import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AiCostAmount } from "./ai-cost-amount";

test("shows the cost in dollars and nothing more when every call was priced", async () => {
  const screen = await render(
    <AiCostAmount cost={{ costNanoUsd: 1_500_000_000, unpricedCalls: 0 }} />,
  );

  await expect.element(screen.getByText("US$ 1,5000")).toBeVisible();
  expect(screen.getByText(/Incompleto/).query()).toBeNull();
});

test("says under the cost that it is incomplete and how many calls had no price", async () => {
  const screen = await render(
    <AiCostAmount cost={{ costNanoUsd: 1_500_000_000, unpricedCalls: 3 }} />,
  );

  await expect.element(screen.getByText("US$ 1,5000")).toBeVisible();
  await expect.element(screen.getByText("Incompleto: 3 llamadas sin precio")).toBeVisible();
});
