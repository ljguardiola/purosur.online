import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { OpenSaleBlock } from "./open-sale-block";

describe("OpenSaleBlock", () => {
  it("names the open sale's total and what to do about it", async () => {
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={vi.fn()} />);

    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await expect
      .element(screen.getByText("Cobrala o cancelala antes de cerrar la caja."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes to the sale when Ir a la venta is pressed", async () => {
    const onGoToSale = vi.fn();
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={onGoToSale} />);

    await userEvent.click(screen.getByRole("button", { name: "Ir a la venta" }));

    expect(onGoToSale).toHaveBeenCalledOnce();
  });
});
