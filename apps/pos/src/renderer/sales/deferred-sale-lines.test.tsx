import type { ReactNode } from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import { page } from "vitest/browser";
import { render as renderPart } from "vitest-browser-react";
import { DeferredSaleLines } from "./deferred-sale-lines";
import { FOUND_PENDING } from "./test-support/deferred-sale-screen";

async function render(part: ReactNode) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  return renderPart(part);
}

function table(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("table", { name: "Líneas de la venta" });
}

describe("DeferredSaleLines", () => {
  it("shows each line's name, price per unit or kilo, quantity and amount", async () => {
    const screen = await render(<DeferredSaleLines lines={FOUND_PENDING.lines} loading={false} />);

    const lines = table(screen);
    for (const header of ["Producto", "Precio", "Cantidad", "Importe"]) {
      await expect.element(lines.getByText(header, { exact: true })).toBeVisible();
    }
    await expect.element(lines.getByText("Almendras peladas")).toBeVisible();
    await expect.element(lines.getByText("$ 18.900,00 / kg")).toBeVisible();
    await expect.element(lines.getByText("0,500 kg")).toBeVisible();
    await expect.element(lines.getByText("$ 9.450,00")).toBeVisible();
    await expect.element(lines.getByText("Yerba mate orgánica 1 kg")).toBeVisible();
    await expect.element(lines.getByText("$ 6.950,00 / u")).toBeVisible();
    await expect.element(lines.getByText("1 u")).toBeVisible();
    await expect.element(lines.getByText("$ 6.950,00", { exact: true }).last()).toBeVisible();
  });

  it("shows the quantity bold like the amount and the price regular", async () => {
    const screen = await render(<DeferredSaleLines lines={FOUND_PENDING.lines} loading={false} />);

    const weightOf = (text: string) =>
      Number(getComputedStyle(table(screen).getByText(text, { exact: true }).element()).fontWeight);
    expect(weightOf("0,500 kg")).toBeGreaterThanOrEqual(600);
    expect(weightOf("1 u")).toBeGreaterThanOrEqual(600);
    expect(weightOf("$ 18.900,00 / kg")).toBeLessThan(600);
  });

  it("marks the lines as locked in its header", async () => {
    const screen = await render(<DeferredSaleLines lines={FOUND_PENDING.lines} loading={false} />);

    await expect
      .element(table(screen).getByRole("img", { name: "Líneas bloqueadas" }))
      .toBeVisible();
  });

  it("asks for the document's QR when it has no lines", async () => {
    const screen = await render(<DeferredSaleLines lines={[]} loading={false} />);

    await expect.element(screen.getByText("Acercá el QR del documento al lector")).toBeVisible();
    await expect
      .element(screen.getByText("Sirve el QR del documento no fiscal de una venta diferida."))
      .toBeVisible();
  });

  it("shows its rows loading instead of the prompt while the lines are read", async () => {
    const screen = await render(<DeferredSaleLines lines={[]} loading />);

    await expect.element(table(screen)).toHaveAttribute("aria-busy", "true");
    await expect
      .element(screen.getByText("Acercá el QR del documento al lector"))
      .not.toBeInTheDocument();
  });
});
