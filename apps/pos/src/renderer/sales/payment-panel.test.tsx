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
      hasApprovedPayment={false}
      chargeRefusal={null}
      paidOrderToApply={undefined}
      canCharge
      canCancel
      canDiscount
      onDiscount={() => {}}
      onCharge={() => {}}
      onChargePaidOrder={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );
}

describe("PaymentPanel", () => {
  it("draws the total as the design system's figure stat", async () => {
    const screen = await renderPanel();

    await expectDrawnAsFigureStat(
      screen.getByText("Total", { exact: true }).element(),
      screen.getByText("$ 4.760,00").first().element(),
      "hero",
    );
  });

  describe("laying out the panel", () => {
    it("keeps the ways to charge at the bottom, below Vaciar and the discount", async () => {
      const screen = await renderPanel();

      const top = (name: string) =>
        screen.getByRole("button", { name }).element().getBoundingClientRect().top;
      const bottom = (name: string) =>
        screen.getByRole("button", { name }).element().getBoundingClientRect().bottom;
      expect(top("Vaciar")).toBeLessThan(top("Cobrar en efectivo"));
      expect(top("Aplicar descuento al total")).toBeLessThan(top("Cobrar en efectivo"));
      expect(bottom("Otros medios")).toBeGreaterThan(bottom("Vaciar"));
      expect(bottom("Otros medios")).toBeGreaterThan(bottom("QR"));
    });

    it("keeps Cancelar venta above the ways to charge as well", async () => {
      const screen = await renderPanel({ hasApprovedPayment: true });

      const cancel = screen.getByRole("button", { name: "Cancelar venta" }).element();
      const cash = screen.getByRole("button", { name: "Cobrar en efectivo" }).element();
      expect(cancel.getBoundingClientRect().top).toBeLessThan(cash.getBoundingClientRect().top);
    });

    it("draws the arrow of Otros medios to the right of its text, before the F1 key", async () => {
      const screen = await renderPanel();

      const button = screen.getByRole("button", { name: "Otros medios" }).element();
      const label = Array.from(button.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Otros medios",
      );
      const arrow = button.querySelector("svg");
      const key = Array.from(button.querySelectorAll("span")).find(
        (span) => span.textContent === "F1",
      );
      expect(label).toBeDefined();
      expect(arrow).not.toBeNull();
      expect(key).toBeDefined();
      const text = document.createRange();
      text.selectNodeContents((label as HTMLElement).firstChild as Node);
      const labelBox = text.getBoundingClientRect();
      const arrowBox = (arrow as SVGElement).getBoundingClientRect();
      const keyBox = (key as HTMLElement).getBoundingClientRect();
      expect(arrowBox.left).toBeGreaterThanOrEqual(labelBox.right - 1);
      expect(keyBox.left).toBeGreaterThanOrEqual(arrowBox.right);
    });
  });

  it.each(["Point débito", "Point crédito", "QR"])(
    "shows the label of the %s tile in full",
    async (label) => {
      const screen = await renderPanel();

      const text = screen.getByText(label, { exact: true }).element();
      expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth);
    },
  );

  it("shows what is paid and the pending balance once part of the sale is paid", async () => {
    const screen = await renderPanel({ paid: 100_000, pending: 376_000 });

    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("Saldo pendiente")).toBeVisible();
    await expect.element(screen.getByText("$ 3.760,00")).toBeVisible();
  });

  it("shows no paid or pending rows while nothing is paid", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Pagado")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Saldo pendiente")).not.toBeInTheDocument();
  });

  it("offers Vaciar for a cart with lines and no approved payment", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByRole("button", { name: "Vaciar" })).toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
  });

  it("offers Cancelar venta, not Vaciar, once a payment was approved", async () => {
    const screen = await renderPanel({ hasApprovedPayment: true });

    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Vaciar" })).not.toBeInTheDocument();
  });

  it("offers neither action for an empty cart", async () => {
    const screen = await renderPanel({ lineCount: 0, total: 0, pending: 0 });

    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Vaciar" })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
  });

  it("offers no action for a sale that cannot be cancelled", async () => {
    const screen = await renderPanel({ cancellable: false });

    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Vaciar" })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
  });

  it("counts the articles of the sale", async () => {
    const screen = await renderPanel({ lineCount: 4 });

    await expect.element(screen.getByText("Artículos")).toBeVisible();
    await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
    await expect.element(screen.getByText(/líneas/)).not.toBeInTheDocument();
  });

  it("shows the amount of the sale at list price as its subtotal once a promotion saved something, counting the articles once", async () => {
    const screen = await renderPanel({ grossSubtotal: 520_000, promotionSavings: 20_000 });

    await expect.element(screen.getByText("Subtotal")).toBeVisible();
    await expect.element(screen.getByText("$ 5.200,00")).toBeVisible();
    await expect.element(screen.getByText("Artículos")).toBeVisible();
    await expect.element(screen.getByText(/líneas/)).not.toBeInTheDocument();
  });

  it("shows the subtotal, counting the articles once, once a discount on the total is applied", async () => {
    const screen = await renderPanel({
      saleDiscount: { kind: "AMOUNT", value: 24_000, amount: 24_000 },
    });

    await expect.element(screen.getByText("Subtotal")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
    await expect.element(screen.getByText(/líneas/)).not.toBeInTheDocument();
  });

  it("shows what the promotions saved, leaving the total to charge as it is", async () => {
    const screen = await renderPanel({ grossSubtotal: 520_000, promotionSavings: 20_000 });

    await expect.element(screen.getByText("Ahorro en promociones")).toBeVisible();
    await expect.element(screen.getByText("− $ 200,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00").first()).toBeVisible();
  });

  it("shows no promotion savings row while no promotion saves anything", async () => {
    const screen = await renderPanel();

    await expect.element(screen.getByText("Artículos")).toBeVisible();
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

  it("counts no articles once the sale cannot be read", async () => {
    const screen = await renderPanel({ saleStatus: "failed", lineCount: 0, total: 0 });

    await expect.element(screen.getByText("Artículos")).toBeVisible();
    await expect.element(screen.getByText("0", { exact: true })).toBeVisible();
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

    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Aplicar descuento al total" }))
      .not.toBeInTheDocument();
  });

  it("counts the articles with the thousands separator", async () => {
    const screen = await renderPanel({ lineCount: 1998 });

    await expect.element(screen.getByText("1.998", { exact: true })).toBeVisible();
  });

  describe("the ways to charge", () => {
    it("offers cash on F12 as the main action and the terminal and QR on tiles with their keys", async () => {
      const screen = await renderPanel();

      const cash = screen.getByRole("button", { name: "Cobrar en efectivo" });
      expect(cash.element().textContent).toMatch(/F12/);
      expect(screen.getByRole("button", { name: "Point débito" }).element().textContent).toMatch(
        /F9/,
      );
      expect(screen.getByRole("button", { name: "Point crédito" }).element().textContent).toMatch(
        /F10/,
      );
      expect(screen.getByRole("button", { name: "QR" }).element().textContent).toMatch(/F11/);
      expect(screen.getByRole("button", { name: "Otros medios" }).element().textContent).toMatch(
        /F1$/,
      );
    });

    it("asks to charge with the method of the button pressed, and with none for the other methods", async () => {
      const onCharge = vi.fn();
      const screen = await renderPanel({ onCharge });

      await screen.getByRole("button", { name: "Cobrar en efectivo" }).click();
      await screen.getByRole("button", { name: "Point débito" }).click();
      await screen.getByRole("button", { name: "Point crédito" }).click();
      await screen.getByRole("button", { name: "QR" }).click();
      await screen.getByRole("button", { name: "Otros medios" }).click();

      expect(onCharge.mock.calls).toEqual([
        ["CASH"],
        ["POINT_DEBIT"],
        ["POINT_CREDIT"],
        ["QR"],
        [undefined],
      ]);
    });

    it("disables every way to charge while the sale cannot be charged", async () => {
      const screen = await renderPanel({ canCharge: false });

      for (const name of [
        "Cobrar en efectivo",
        "Point débito",
        "Point crédito",
        "QR",
        "Otros medios",
      ]) {
        await expect.element(screen.getByRole("button", { name })).toBeDisabled();
      }
    });

    it("shows the paid order and its single button with Enter instead of the ways to charge", async () => {
      const onChargePaidOrder = vi.fn();
      const screen = await renderPanel({
        paidOrderToApply: { method: "QR", amount: 920_000 },
        onChargePaidOrder,
      });

      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent(
          "Pago con Mercado Pago de $ 9.200,00 Aplicado a la venta antes de cobrar con otro medio.",
        );
      const apply = screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" });
      expect(apply.element().textContent).toMatch(/Enter/);
      for (const name of [
        "Cobrar en efectivo",
        "Point débito",
        "Point crédito",
        "QR",
        "Otros medios",
      ]) {
        await expect.element(screen.getByRole("button", { name })).not.toBeInTheDocument();
      }
      await apply.click();
      expect(onChargePaidOrder).toHaveBeenCalledOnce();
    });

    it.each([
      ["QR", "lucide-qr-code"],
      ["POINT", "lucide-credit-card"],
    ] as const)(
      "draws the %s paid order's button with the same icon as its notice",
      async (method, iconClass) => {
        const screen = await renderPanel({ paidOrderToApply: { method, amount: 920_000 } });

        const noticeIcon = screen.getByRole("status").element().parentElement?.querySelector("svg");
        const buttonIcon = screen
          .getByRole("button", { name: "Cobrar con el pago de Mercado Pago" })
          .element()
          .querySelector("svg");
        expect(noticeIcon?.classList.contains(iconClass)).toBe(true);
        expect(buttonIcon?.classList.contains(iconClass)).toBe(true);
      },
    );

    it("disables the paid order's button while the core refuses the charge, saying why", async () => {
      const screen = await renderPanel({
        paidOrderToApply: { method: "QR", amount: 920_000 },
        chargeRefusal: { kind: "no_buyer_identification_threshold" },
        canCharge: false,
      });

      await expect.element(screen.getByText("Falta el tope de venta")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Cobrar con el pago de Mercado Pago" }))
        .toBeDisabled();
    });
  });
});
