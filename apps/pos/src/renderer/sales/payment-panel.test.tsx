import { SummaryRow } from "@purosur/ui";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectDrawnAsFigureStat } from "../platform/test-support/figure-stat";
import { expectDrawnLike } from "../shell/test-support/drawn-like";
import type { PaymentPanelProps } from "./payment-panel";
import { PaymentPanel } from "./payment-panel";

function renderPanel(props: Partial<PaymentPanelProps> = {}) {
  return render(
    <PaymentPanel
      saleStatus="loaded"
      lineCount={2}
      grossSubtotal={500_000}
      promotionSavings={0}
      saleDiscount={null}
      total={476_000}
      paid={0}
      pending={476_000}
      cancellable
      chargeRefusal={null}
      canCancel
      canDiscount
      onDiscount={() => {}}
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

  it("counts the lines with the amount of the sale at list price", async () => {
    const screen = await renderPanel({ grossSubtotal: 520_000, promotionSavings: 20_000 });

    await expect.element(screen.getByText("2 líneas")).toBeVisible();
    await expect.element(screen.getByText("$ 5.200,00")).toBeVisible();
  });

  it("shows what the promotions saved, leaving the total to charge as it is", async () => {
    const screen = await renderPanel({ grossSubtotal: 520_000, promotionSavings: 20_000 });

    await expect.element(screen.getByText("Ahorro en promociones")).toBeVisible();
    await expect.element(screen.getByText("− $ 200,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00").first()).toBeVisible();
  });

  it("shows no promotion savings row while no promotion saves anything", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("2 líneas")).toBeVisible();
    await expect.element(screen.getByText("Ahorro en promociones")).not.toBeInTheDocument();
  });

  it("draws the promotion savings like a summary row of a saving", async () => {
    const screen = await renderPanel({ grossSubtotal: 520_000, promotionSavings: 20_000 });
    const reference = await render(<SummaryRow label="Referencia" value="− $ 2,00" saving />);

    expectDrawnLike(
      screen.getByText("− $ 200,00", { exact: true }).element(),
      reference.getByText("− $ 2,00", { exact: true }).element(),
      ["color", "fontSize", "fontWeight"],
      "promotion savings",
    );
    await reference.unmount();
  });

  it("says the discount on the total is not applied while the sale has none", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("Descuento sobre el total")).toBeVisible();
    await expect.element(screen.getByText("Sin aplicar")).toBeVisible();
  });

  it("shows a placeholder instead of the discount on the total while the sale loads", async () => {
    const screen = await renderPanel({ saleStatus: "loading" });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByText("Descuento sobre el total")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Sin aplicar")).not.toBeInTheDocument();
  });

  it("says nothing of the discount on the total once the sale cannot be read", async () => {
    const screen = await renderPanel({ saleStatus: "failed" });

    await expect.element(screen.getByText("Descuento sobre el total")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Sin aplicar")).not.toBeInTheDocument();
  });

  it("shows the amount of a percentage discount on the total with its percentage", async () => {
    const screen = await renderPanel({
      saleDiscount: { kind: "PERCENT", value: 5, amount: 24_000 },
    });

    await expect.element(screen.getByText("Descuento sobre el total · 5 %")).toBeVisible();
    await expect.element(screen.getByText("− $ 240,00")).toBeVisible();
    await expect.element(screen.getByText("Sin aplicar")).not.toBeInTheDocument();
  });

  it("shows the amount of a fixed discount on the total", async () => {
    const screen = await renderPanel({
      saleDiscount: { kind: "AMOUNT", value: 24_000, amount: 24_000 },
    });

    await expect.element(screen.getByText("Descuento sobre el total")).toBeVisible();
    await expect.element(screen.getByText("− $ 240,00")).toBeVisible();
  });

  it("draws an applied discount like a summary row in the error tone", async () => {
    const screen = await renderPanel({
      saleDiscount: { kind: "AMOUNT", value: 24_000, amount: 24_000 },
    });
    const reference = await render(<SummaryRow label="Referencia" value="− $ 2,00" tone="error" />);

    expectDrawnLike(
      screen.getByText("− $ 240,00", { exact: true }).element(),
      reference.getByText("− $ 2,00", { exact: true }).element(),
      ["color", "fontSize", "fontWeight"],
      "discount",
    );
    await reference.unmount();
  });

  it("asks to apply a discount on the total", async () => {
    const onDiscount = vi.fn();
    const screen = await renderPanel({ onDiscount });

    await screen.getByRole("button", { name: "Aplicar descuento al total" }).click();

    expect(onDiscount).toHaveBeenCalledOnce();
  });

  it("offers no discount on the total while it cannot be applied", async () => {
    const screen = await renderPanel({ canDiscount: false });

    await expect
      .element(screen.getByRole("button", { name: "Aplicar descuento al total" }))
      .toBeDisabled();
  });

  it("offers no discount on the total while the sale loads", async () => {
    const screen = await renderPanel({ saleStatus: "loading", canDiscount: false });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Aplicar descuento al total" }))
      .not.toBeInTheDocument();
  });

  it("offers no discount on the total once the sale cannot be read", async () => {
    const screen = await renderPanel({ saleStatus: "failed", canDiscount: false });

    await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Aplicar descuento al total" }))
      .not.toBeInTheDocument();
  });

  it("counts the lines with the thousands separator", async () => {
    const screen = await renderPanel({ lineCount: 1998 });

    await expect.element(screen.getByText("1.998 líneas")).toBeVisible();
  });
});
