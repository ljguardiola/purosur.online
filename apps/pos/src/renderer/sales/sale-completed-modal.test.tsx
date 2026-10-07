import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SaleCompletedModal } from "./sale-completed-modal";

async function renderModal(
  amounts:
    | { total: number; tendered: number; change: number }
    | { total: number; method: "TRANSFER"; amount: number },
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onNewSale = vi.fn();
  const screen = await render(<SaleCompletedModal {...amounts} onNewSale={onNewSale} />);
  return { screen, onNewSale };
}

describe("SaleCompletedModal", () => {
  it("tells the cashier to hand over the change and shows what was charged", async () => {
    const { screen } = await renderModal({ total: 476_000, tendered: 500_000, change: 24_000 });

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo entregado")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there is no change to hand over, and leaves the change row out, when the payment was exact", async () => {
    const { screen } = await renderModal({ total: 476_000, tendered: 476_000, change: 0 });

    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).toBeVisible();
  });

  it("says there is no change to hand over and shows the total charged by transfer", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "TRANSFER", amount: 476_000 });

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    expect(screen.getByText("$ 4.760,00").elements()).toHaveLength(2);
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only what the last transfer charged when it paid part of the sale", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "TRANSFER", amount: 300_000 });

    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
  });

  it("starts a new sale from its only button", async () => {
    const { screen, onNewSale } = await renderModal({
      total: 476_000,
      tendered: 500_000,
      change: 24_000,
    });

    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    expect(onNewSale).toHaveBeenCalledOnce();
    expect(screen.getByRole("button").elements()).toHaveLength(1);
  });
});
