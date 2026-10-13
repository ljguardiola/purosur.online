import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { MercadoPagoPaidModal } from "./mercado-pago-paid-modal";

async function renderModal(pending: number | undefined) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onContinue = vi.fn();
  const screen = await render(
    <MercadoPagoPaidModal
      context="POINT INTEGRADA"
      title="El cliente pagó en la terminal"
      paidLabel="Pagado con la Point"
      amount={300_000}
      pending={pending}
      onContinue={onContinue}
    />,
  );
  return { screen, onContinue };
}

describe("MercadoPagoPaidModal", () => {
  it("shows what the customer paid and advances only from Continuar", async () => {
    const { screen, onContinue } = await renderModal(undefined);

    await expect.element(screen.getByText("POINT INTEGRADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pagado con la Point")).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("Falta cobrar")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["Continuar"]);
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows what is still to be charged after a partial payment", async () => {
    const { screen } = await renderModal(176_000);

    await expect.element(screen.getByText("Falta cobrar")).toBeVisible();
    await expect.element(screen.getByText("$ 1.760,00")).toBeVisible();
  });
});
