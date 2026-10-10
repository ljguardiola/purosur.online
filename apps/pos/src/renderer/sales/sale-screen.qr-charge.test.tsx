import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderScreen, SALE_OF_YERBA } from "./test-support/sale-screen";

const QR_WAIT_LOCK = "Hay un cobro con QR en curso. Esperá a que termine.";
const APPROVED_PAYMENT_LOCK = "La venta ya no se puede cambiar porque tiene un pago aprobado.";

const SALE_IN_A_QR_WAIT: OpenSale = {
  ...SALE_OF_YERBA,
  lines_lock: "qr_charge_in_progress",
  cancellable: false,
  cancel_refusal: "qr_charge_in_progress",
};
const SALE_WITH_QR_PAYMENT: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  cancellable: false,
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

  it("keeps offering to cancel and says why it is refused, without asking the core", async () => {
    const cancelSale = vi.fn();
    const cancelPaidSale = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_IN_A_QR_WAIT,
      cancelSale,
      cancelPaidSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText("Hay un cobro con QR en curso")).toBeVisible();
    await expect
      .element(screen.getByText("Esperá a que termine para cancelar la venta."))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(cancelSale).not.toHaveBeenCalled();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});

describe("SaleScreen with an approved QR payment", () => {
  it("explains the lines are locked by the approved payment", async () => {
    const { field } = await renderScreen({ currentSale: async () => SALE_WITH_QR_PAYMENT });

    await expect.element(field).toHaveAccessibleDescription(APPROVED_PAYMENT_LOCK);
  });

  it("keeps offering to cancel and says it cannot be voided from the register, without asking the core", async () => {
    const cancelSale = vi.fn();
    const cancelPaidSale = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_WITH_QR_PAYMENT,
      cancelSale,
      cancelPaidSale,
    });

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
    expect(cancelSale).not.toHaveBeenCalled();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});
