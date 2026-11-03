import type { CashChargeAnswer, ChargeSaleInCashOutcome } from "@purosur/contracts";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { renderCashChargeModal, valueBeside } from "./test-support/cash-charge-modal";

const SALE_OF_3270 = { total: 327_000, paid: 0, pending: 327_000, subtotal: 327_000 };

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

it("shows the rounding, the cash to charge and the change the core answers, and charges what was typed", async () => {
  const { screen, field, complete, chargeSale, callbacks } = await renderCashChargeModal({
    sale: SALE_OF_3270,
    readCharge: async () => ROUNDED_COVERED,
    charge: async () => ROUNDED_COMPLETION,
  });

  await userEvent.fill(field, "5000");

  await expect.poll(() => valueBeside(screen, "Redondeo")).toBe("− $ 70,00");
  expect(valueBeside(screen, "A cobrar en efectivo")).toBe("$ 3.200,00");
  expect(screen.getByText("A cobrar ahora").query()).toBeNull();
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
  await expect.element(screen.getByText("$ 1.800,00", { exact: true })).toBeVisible();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSale).toHaveBeenCalledWith(500_000);
  expect(callbacks.onCompleted).toHaveBeenCalledWith(ROUNDED_COMPLETION);
});

it("shows no rounding row when the core answers no rounding", async () => {
  const { screen, field } = await renderCashChargeModal({
    sale: { total: 320_000, paid: 0, pending: 320_000, subtotal: 320_000 },
    readCharge: async () => ({
      kind: "covered",
      applied: 320_000,
      change: 180_000,
      cash_rounding: 0,
    }),
  });

  await userEvent.fill(field, "5000");

  await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
  expect(screen.getByText("Redondeo").query()).toBeNull();
  expect(valueBeside(screen, "A cobrar ahora")).toBe("$ 3.200,00");
});

it("shows no rounding row for a partial cash amount", async () => {
  const { screen, field } = await renderCashChargeModal({
    sale: SALE_OF_3270,
    readCharge: async () => ({ kind: "partial", applied: 200_000, pending: 127_000 }),
  });

  await userEvent.fill(field, "2000");

  await expect.element(screen.getByText("QUEDA PENDIENTE")).toBeVisible();
  expect(screen.getByText("Redondeo").query()).toBeNull();
  expect(valueBeside(screen, "A cobrar ahora")).toBe("$ 3.270,00");
});

it("shows the rounding after the discount typed for lack of change", async () => {
  const { screen, field, discountField, readCashCharge } = await renderCashChargeModal({
    sale: { total: 332_000, paid: 0, pending: 332_000, subtotal: 332_000 },
    previewSaleDiscount: async () => ({
      kind: "preview",
      subtotal: 332_000,
      discount_amount: 5_000,
      total: 327_000,
    }),
    readCharge: async () => ROUNDED_COVERED,
  });

  await userEvent.fill(field, "5000");
  await userEvent.fill(discountField, "50");

  await expect.poll(() => valueBeside(screen, "Redondeo")).toBe("− $ 70,00");
  expect(valueBeside(screen, "Después de promociones")).toBe("$ 3.320,00");
  expect(valueBeside(screen, "Descuento sobre el total")).toBe("− $ 50,00");
  expect(valueBeside(screen, "A cobrar en efectivo")).toBe("$ 3.200,00");
  expect(readCashCharge).toHaveBeenLastCalledWith(500_000, 5_000);
});
