import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CancelLockedSalePanel } from "./cancel-locked-sale-panel";

const QR_WAIT =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para vaciar el carrito.";

async function renderPanel(options: { busy?: boolean; refusal?: string } = {}) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const callbacks = { onClose: vi.fn(), onEmpty: vi.fn() };
  const screen = await render(
    <CancelLockedSalePanel
      lineCount={4}
      total={2_519_250}
      busy={options.busy ?? false}
      {...(options.refusal === undefined ? {} : { refusal: options.refusal })}
      {...callbacks}
    />,
  );
  return { screen, ...callbacks };
}

describe("CancelLockedSalePanel", () => {
  it("shows what would be discarded: the total and how many lines the cart holds", async () => {
    const { screen } = await renderPanel();

    await expect
      .element(screen.getByRole("complementary", { name: "¿Vaciar el carrito?" }))
      .toBeVisible();
    await expect.element(screen.getByText("VENTA ABIERTA · SIN PAGOS")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Líneas en el carrito")).toBeVisible();
    await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("empties the cart with the button and with Enter", async () => {
    const { screen, onEmpty } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Vaciar carrito" }));
    await userEvent.keyboard("{Enter}");

    expect(onEmpty).toHaveBeenCalledTimes(2);
  });

  it("goes back with Esc and with its close button, without emptying", async () => {
    const { screen, onClose, onEmpty } = await renderPanel();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("ignores Esc and Enter while the cart is being emptied", async () => {
    const { screen, onClose, onEmpty } = await renderPanel({ busy: true });

    await userEvent.keyboard("{Escape}{Enter}");

    expect(onClose).not.toHaveBeenCalled();
    expect(onEmpty).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("button", { name: "Vaciar carrito" })).toBeDisabled();
  });

  it("says why it cannot empty the cart while a charge is in progress, keeping only Esc", async () => {
    const { screen, onClose, onEmpty } = await renderPanel({ refusal: QR_WAIT });

    await expect.element(screen.getByRole("alert")).toHaveTextContent(QR_WAIT);
    await expect.element(screen.getByRole("button", { name: "Vaciar carrito" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onEmpty).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
