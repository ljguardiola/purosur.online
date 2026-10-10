import type { CurrentSaleAnswer, OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderScreen, SALE_OF_YERBA } from "./test-support/sale-screen";

const WAIT_OVER_TIMEOUT_MS = 5_000;

function answering(...answers: CurrentSaleAnswer[]) {
  return vi.fn(async () => (answers.length > 1 ? answers.shift() : answers[0]) ?? null);
}

const QR_WAIT_LOCK = "Hay un cobro con QR en curso. Esperá a que termine.";
const APPROVED_PAYMENT_LOCK = "La venta ya no se puede cambiar porque tiene un pago aprobado.";

const SALE_IN_A_QR_WAIT: OpenSale = {
  ...SALE_OF_YERBA,
  lines_lock: "qr_charge_in_progress",
  cancel_refusal: "qr_charge_in_progress",
};
const SALE_WITH_QR_PAYMENT: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  cancel_refusal: "holds_qr_payment",
};

describe("SaleScreen while a QR charge of the sale is in its wait", () => {
  it("locks the scan field and the line controls, explaining on the field that a QR charge is in progress", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_IN_A_QR_WAIT });

    await expect.element(field).toHaveAccessibleDescription(QR_WAIT_LOCK);
    await expect.element(field).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("button", { name: "Quitar Yerba mate 1 kg" }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("lifts the lock once the core says the wait is over", async () => {
    const { field } = await renderScreen({
      currentSale: answering(SALE_IN_A_QR_WAIT, SALE_OF_YERBA),
    });
    await expect.element(field).toHaveAccessibleDescription(QR_WAIT_LOCK);

    await expect
      .element(field, { timeout: WAIT_OVER_TIMEOUT_MS })
      .not.toHaveAttribute("aria-disabled", "true");
  });

  it("keeps offering to cancel and says why the core still refuses it", async () => {
    const currentSale = answering(SALE_IN_A_QR_WAIT);
    const cancelSale = vi.fn();
    const cancelPaidSale = vi.fn();
    const { screen } = await renderScreen({ currentSale, cancelSale, cancelPaidSale });
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();
    const readsBefore = currentSale.mock.calls.length;

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText("Hay un cobro con QR en curso")).toBeVisible();
    await expect
      .element(screen.getByText("Esperá a que termine para cancelar la venta."))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(cancelSale).not.toHaveBeenCalled();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });

  it("asks the core before refusing to cancel, and asks to confirm when the core no longer refuses", async () => {
    const { screen } = await renderScreen({
      currentSale: answering(SALE_IN_A_QR_WAIT, SALE_OF_YERBA),
    });
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await expect.element(screen.getByText("Hay un cobro con QR en curso")).not.toBeInTheDocument();
  });

  it("says the sale could not be cancelled when the core cannot answer whether it still refuses", async () => {
    const currentSale = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE_IN_A_QR_WAIT)
      .mockRejectedValue(new Error("the connection was replaced"));
    const cancelSale = vi.fn();
    const { screen } = await renderScreen({ currentSale, cancelSale });
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText("No se pudo cancelar la venta")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(cancelSale).not.toHaveBeenCalled();
  });
});

describe("SaleScreen with an approved QR payment", () => {
  it("explains the lines are locked by the approved payment", async () => {
    const { field } = await renderScreen({ currentSale: async () => SALE_WITH_QR_PAYMENT });

    await expect.element(field).toHaveAccessibleDescription(APPROVED_PAYMENT_LOCK);
  });

  it("keeps offering to cancel and says it cannot be voided from the register, as the core still answers", async () => {
    const currentSale = answering(SALE_WITH_QR_PAYMENT);
    const cancelSale = vi.fn();
    const cancelPaidSale = vi.fn();
    const { screen } = await renderScreen({ currentSale, cancelSale, cancelPaidSale });
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText("No se puede cancelar la venta")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La venta tiene un pago con QR: todavía no se puede anular desde la caja.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(currentSale).toHaveBeenCalledTimes(2);
    expect(cancelSale).not.toHaveBeenCalled();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});
