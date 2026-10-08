import type { OpenSale } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PaidSaleCancelledModal } from "./paid-sale-cancelled-modal";

const CASH_REFUND: OpenSale["refunds_on_cancel"][number] = {
  payment_id: "p1",
  method: "CASH",
  amount: 100_000,
  state: "APPROVED",
};
const TRANSFER_REFUND: OpenSale["refunds_on_cancel"][number] = {
  payment_id: "p2",
  method: "TRANSFER",
  amount: 250_000,
  state: "PENDING",
};

async function renderModal(refunds: OpenSale["refunds_on_cancel"]) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onClose = vi.fn();
  const screen = await render(<PaidSaleCancelledModal refunds={refunds} onClose={onClose} />);
  return { screen, onClose };
}

describe("PaidSaleCancelledModal", () => {
  it("tells the cashier what to give back in cash and what stays pending", async () => {
    const { screen } = await renderModal([CASH_REFUND, TRANSFER_REFUND]);

    await expect.element(screen.getByRole("dialog", { name: "Venta cancelada" })).toBeVisible();
    await expect
      .element(screen.getByText("Devolver $ 1.000,00 en efectivo", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText("Reembolso pendiente de la transferencia por $ 2.500,00", { exact: true }),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("closes from Listo", async () => {
    const { screen, onClose } = await renderModal([CASH_REFUND]);

    await userEvent.click(screen.getByRole("button", { name: "Listo" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
