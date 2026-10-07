import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { expectDrawnAsFigureStat } from "../platform/test-support/figure-stat";
import type { PaymentPanelProps } from "./payment-panel";
import { PaymentPanel } from "./payment-panel";

function renderPanel(props: Partial<PaymentPanelProps> = {}) {
  return render(
    <PaymentPanel
      lineCount={2}
      total={476_000}
      paid={0}
      pending={476_000}
      cancellable
      chargeRefusal={null}
      canCancel
      onCharge={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );
}

describe("PaymentPanel", () => {
  it("draws the total as the design system's figure stat", async () => {
    const screen = await renderPanel();

    await expectDrawnAsFigureStat(
      screen.getByText("Total a cobrar").element(),
      screen.getByText("$ 4.760,00").first().element(),
    );
  });

  it("shows what is paid and the pending balance once part of the sale is paid", async () => {
    const screen = await renderPanel({ paid: 100_000, pending: 376_000 });

    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("Saldo pendiente")).toBeVisible();
    await expect.element(screen.getByText("$ 3.760,00")).toBeVisible();
  });

  it("shows no paid or pending rows while nothing is paid", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("Total a cobrar")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Saldo pendiente")).not.toBeInTheDocument();
  });

  it("offers Cancelar venta for a sale that can be cancelled", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();
  });

  it("offers no Cancelar venta for a sale that cannot be cancelled", async () => {
    const screen = await renderPanel({ cancellable: false });

    await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
  });
});
