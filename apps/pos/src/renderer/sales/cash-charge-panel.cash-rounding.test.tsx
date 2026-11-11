import type { CashChargeAnswer, ChargeSaleInCashOutcome } from "@purosur/contracts";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  amountsOf,
  renderCashChargePanel,
  typeDiscount,
  valueBeside,
} from "./test-support/cash-charge-panel";

const SALE_OF_3270 = { total: 327_000, paid: 0, pending: 327_000 };
const ROUNDED_AMOUNTS = amountsOf(320_000, { cash_rounding: 7_000 });

const ROUNDED_COMPLETION: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 320_000,
  tendered: 500_000,
  change: 180_000,
  cash_rounding: 7_000,
};

const ROUNDED_COVERED: CashChargeAnswer = {
  kind: "covered",
  applied: 320_000,
  change: 180_000,
  cash_rounding: 7_000,
};

it("shows the rounding, the amount to charge and the change the core answers, and charges what was typed", async () => {
  const { screen, field, complete, chargeSale, callbacks } = await renderCashChargePanel({
    sale: SALE_OF_3270,
    readAmounts: async () => ROUNDED_AMOUNTS,
    readCharge: async () => ROUNDED_COVERED,
    charge: async () => ROUNDED_COMPLETION,
  });

  await userEvent.fill(field, "5000");

  await expect.poll(() => valueBeside(screen, "Redondeo")).toBe("– $ 70,00");
  expect(valueBeside(screen, "A COBRAR")).toBe("$ 3.200,00");
  expect(valueBeside(screen, "Total")).toBe("$ 3.270,00");
  await expect.element(screen.getByText("VUELTO")).toBeVisible();
  await expect.element(screen.getByText("$ 1.800,00", { exact: true })).toBeVisible();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSale).toHaveBeenCalledWith(500_000);
  expect(callbacks.onCompleted).toHaveBeenCalledWith(ROUNDED_COMPLETION);
});

it("shows no rounding row when the core answers no rounding", async () => {
  const { screen, field } = await renderCashChargePanel({
    sale: { total: 320_000, paid: 0, pending: 320_000 },
    readAmounts: async () => amountsOf(320_000),
    readCharge: async () => ({
      kind: "covered",
      applied: 320_000,
      change: 180_000,
      cash_rounding: 0,
    }),
  });

  await userEvent.fill(field, "5000");

  await expect.element(screen.getByText("VUELTO")).toBeVisible();
  expect(screen.getByText("Redondeo").query()).toBeNull();
  expect(valueBeside(screen, "A COBRAR")).toBe("$ 3.200,00");
});

it("shows no rounding, and the whole amount due to charge, for a partial cash amount", async () => {
  const { screen, field } = await renderCashChargePanel({
    sale: SALE_OF_3270,
    readAmounts: async () => ROUNDED_AMOUNTS,
    readCharge: async () => ({ kind: "partial", applied: 200_000, pending: 127_000 }),
  });

  await userEvent.fill(field, "2000");

  await expect.element(screen.getByText("QUEDA PENDIENTE")).toBeVisible();
  await expect.element(screen.getByText("$ 1.270,00", { exact: true })).toBeVisible();
  expect(screen.getByText("Redondeo").query()).toBeNull();
  expect(valueBeside(screen, "A COBRAR")).toBe("$ 3.270,00");
});

it("shows the rounding after the discount typed for lack of change", async () => {
  const panel = await renderCashChargePanel({
    sale: { total: 332_000, paid: 0, pending: 332_000 },
    readAmounts: async () => ROUNDED_AMOUNTS,
    readCharge: async () => ROUNDED_COVERED,
  });

  await userEvent.fill(panel.field, "5000");
  await typeDiscount(panel, "50");

  await expect.poll(() => valueBeside(panel.screen, "Redondeo")).toBe("– $ 70,00");
  expect(valueBeside(panel.screen, "Total")).toBe("$ 3.320,00");
  expect(valueBeside(panel.screen, "Falta de cambio")).toBe("– $ 50,00");
  expect(valueBeside(panel.screen, "A COBRAR")).toBe("$ 3.200,00");
  expect(panel.readCashCharge).toHaveBeenLastCalledWith(500_000, 5_000);
  expect(panel.readCashChargeAmounts).toHaveBeenLastCalledWith(5_000);
});
