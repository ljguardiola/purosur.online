import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CancelLockedSaleModal } from "./cancel-locked-sale-modal";

async function renderModal(options: { open?: boolean; busy?: boolean } = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const callbacks = { onClose: vi.fn(), onCancelSale: vi.fn() };
  const screen = await render(
    <CancelLockedSaleModal
      open={options.open ?? true}
      total={3_434_000}
      busy={options.busy ?? false}
      {...callbacks}
    />,
  );
  return { screen, callbacks, dialog: screen.getByRole("dialog", { name: "¿Cancelar la venta?" }) };
}

describe("CancelLockedSaleModal", () => {
  it("shows what would be discarded", async () => {
    const { screen, dialog } = await renderModal();

    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Venta abierta · Sin pagos")).toBeVisible();
    await expect.element(dialog.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("$ 34.340,00")).toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows nothing while it is closed", async () => {
    const { dialog } = await renderModal({ open: false });

    await expect.element(dialog).not.toBeInTheDocument();
  });

  it("cancels the sale when asked to", async () => {
    const { dialog, callbacks } = await renderModal();

    await dialog.getByRole("button", { name: "Cancelar la venta" }).click();

    expect(callbacks.onCancelSale).toHaveBeenCalledOnce();
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it("closes without cancelling when asked to go back", async () => {
    const { dialog, callbacks } = await renderModal();

    await dialog.getByRole("button", { name: "Volver" }).click();

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(callbacks.onCancelSale).not.toHaveBeenCalled();
  });

  it("disables both buttons while the sale is being cancelled", async () => {
    const { dialog } = await renderModal({ busy: true });

    await expect.element(dialog.getByRole("button", { name: "Cancelar la venta" })).toBeDisabled();
    await expect.element(dialog.getByRole("button", { name: "Volver" })).toBeDisabled();
  });
});
