import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { WeightReadout, type WeightReadoutProps } from "./weight-readout";

const readout = {
  weightLabel: "Peso",
  weight: "0,172 kg",
  amountLabel: "Importe",
  amount: "$ 2.820,80",
};

test("shows the weight and the amount, each under its label", async () => {
  const screen = await render(<WeightReadout {...readout} settled />);

  await expect.element(screen.getByText("Peso")).toBeVisible();
  await expect.element(screen.getByText("0,172 kg")).toBeVisible();
  await expect.element(screen.getByText("Importe")).toBeVisible();
  await expect.element(screen.getByText("$ 2.820,80")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("draws both figures side by side in equal tiles", async () => {
  const screen = await render(<WeightReadout {...readout} settled />);
  const weight = screen.getByText("0,172 kg").element().getBoundingClientRect();
  const amount = screen.getByText("$ 2.820,80").element().getBoundingClientRect();

  expect(amount.left).toBeGreaterThan(weight.right);
  expect(Math.abs(amount.top - weight.top)).toBeLessThan(1);
});

test("draws the figures in the regular text color once the reading settled", async () => {
  const screen = await render(<WeightReadout {...readout} settled />);

  expect(getComputedStyle(screen.getByText("0,172 kg").element()).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(screen.getByText("$ 2.820,80").element()).color).toBe(tokenRgb("text"));
});

test("draws the figures grey while the reading has not settled", async () => {
  const screen = await render(<WeightReadout {...readout} settled={false} />);

  expect(getComputedStyle(screen.getByText("0,172 kg").element()).color).toBe(
    tokenRgb("text-subtle"),
  );
  expect(getComputedStyle(screen.getByText("$ 2.820,80").element()).color).toBe(
    tokenRgb("text-subtle"),
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a readout without saying whether it settled", () => {
  expectTypeOf<typeof readout>().not.toExtend<WeightReadoutProps>();
});
