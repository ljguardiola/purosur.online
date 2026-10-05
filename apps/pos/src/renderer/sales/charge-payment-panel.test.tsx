import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectDrawnAsFigureStat } from "../platform/test-support/figure-stat";
import { ChargePaymentPanel } from "./charge-payment-panel";

describe("ChargePaymentPanel", () => {
  it("shows the total, that nothing is paid yet and the whole total still pending", async () => {
    const screen = await render(
      <ChargePaymentPanel total={476_000} paid={0} onBackToSale={() => {}} />,
    );

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("Total a cobrar")).toBeVisible();
    await expect.element(panel.getByText("$ 4.760,00").first()).toBeVisible();
    await expect.element(panel.getByText("Pagado")).toBeVisible();
    await expect.element(panel.getByText("$ 0,00")).toBeVisible();
    await expect.element(panel.getByText("Saldo pendiente")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("draws the total as the design system's figure stat", async () => {
    const screen = await render(<ChargePaymentPanel total={476_000} paid={0} />);

    await expectDrawnAsFigureStat(
      screen.getByText("Total a cobrar").element(),
      screen.getByText("$ 4.760,00").first().element(),
    );
  });

  it("goes back to the sale from Volver a la venta", async () => {
    const onBackToSale = vi.fn();
    const screen = await render(
      <ChargePaymentPanel total={476_000} paid={0} onBackToSale={onBackToSale} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Volver a la venta" }));

    expect(onBackToSale).toHaveBeenCalledOnce();
  });

  it("shows the sale as paid, with nothing pending and no way back, once it is fully paid", async () => {
    const screen = await render(<ChargePaymentPanel total={476_000} paid={476_000} />);

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("Saldo pendiente")).toBeVisible();
    await expect.element(panel.getByText("$ 0,00")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Volver a la venta" }))
      .not.toBeInTheDocument();
  });
});
