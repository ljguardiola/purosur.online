import { HighlightedNotice } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Info } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render as renderBare } from "vitest-browser-react";
import { render } from "../shell/test-support/render-with-router";
import { OpenSaleBlock } from "./open-sale-block";

describe("OpenSaleBlock", () => {
  it("names the open sale's total and what to do about it", async () => {
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={vi.fn()} />);

    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await expect.element(screen.getByText("Terminala antes de cerrar la caja.")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes to the sale when Ir a la venta is pressed", async () => {
    const onGoToSale = vi.fn();
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={onGoToSale} />);

    await userEvent.click(screen.getByRole("button", { name: "Ir a la venta" }));

    expect(onGoToSale).toHaveBeenCalledOnce();
  });

  it("goes to the sale with the key V, shown on the button", async () => {
    const onGoToSale = vi.fn();
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={onGoToSale} />);

    await expect
      .element(screen.getByRole("button", { name: "Ir a la venta" }))
      .toHaveTextContent("V");
    await userEvent.keyboard("v");

    expect(onGoToSale).toHaveBeenCalledOnce();
  });

  it("announces the open sale as a warning notice with its basket icon", async () => {
    const screen = await render(<OpenSaleBlock total={3_434_000} onGoToSale={vi.fn()} />);
    const notice = screen.container.firstElementChild as HTMLElement;

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Hay una venta abierta de $ 34.340,00 Terminala antes de cerrar la caja.");

    const warning = await renderBare(
      <HighlightedNotice tone="warning" icon={<Info />} title="Referencia" description="Aviso" />,
    );
    const warningNotice = warning.container.firstElementChild as HTMLElement;
    expect(getComputedStyle(notice).backgroundColor).toBe(
      getComputedStyle(warningNotice).backgroundColor,
    );
    expect(
      notice.querySelector(":scope > [aria-hidden='true'] > svg.lucide-shopping-basket"),
    ).not.toBeNull();
  });
});
