import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { LockedOpenSaleBanner } from "./locked-open-sale-banner";

async function renderBanner(options: { hasApprovedPayment?: boolean; disabled?: boolean } = {}) {
  const onCancel = vi.fn();
  const screen = await render(
    <LockedOpenSaleBanner
      total={2_519_250}
      hasApprovedPayment={options.hasApprovedPayment ?? false}
      disabled={options.disabled ?? false}
      onCancel={onCancel}
    />,
  );
  return { screen, onCancel };
}

describe("LockedOpenSaleBanner", () => {
  it("tells to empty the cart of a sale with no payments, with the key V on the action", async () => {
    const { screen } = await renderBanner();

    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Vaciá la venta para cerrar la caja.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Vaciar venta" }))
      .toHaveTextContent("Vaciar ventaV");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells to cancel a sale with payments, with the key V on the action", async () => {
    const { screen } = await renderBanner({ hasApprovedPayment: true });

    await expect.element(screen.getByText("Cancelala para cerrar la caja.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar la venta" }))
      .toHaveTextContent("Cancelar la ventaV");
  });

  it("asks to cancel with the action and with V", async () => {
    const { screen, onCancel } = await renderBanner();

    await userEvent.click(screen.getByRole("button", { name: "Vaciar venta" }));
    await userEvent.keyboard("v");

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("asks nothing while disabled", async () => {
    const { screen, onCancel } = await renderBanner({ disabled: true });

    await userEvent.keyboard("v");

    await expect.element(screen.getByRole("button", { name: "Vaciar venta" })).toBeDisabled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
