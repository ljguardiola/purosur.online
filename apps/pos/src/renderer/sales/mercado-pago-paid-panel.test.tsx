import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { QrCode } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { MercadoPagoPaidPanel } from "./mercado-pago-paid-panel";

async function renderPanel(pending: number | undefined, children?: React.ReactNode) {
  await page.viewport(1280, 1000);
  const onContinue = vi.fn();
  const screen = await render(
    <MercadoPagoPaidPanel
      icon={<QrCode />}
      title="QR"
      paidLabel="Pagado con QR"
      amount={2_519_250}
      pending={pending}
      onContinue={onContinue}
    >
      {children}
    </MercadoPagoPaidPanel>,
  );
  return { screen, onContinue };
}

describe("MercadoPagoPaidPanel", () => {
  it("shows what was charged and how", async () => {
    const { screen } = await renderPanel(undefined);

    await expect.element(screen.getByText("QR", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("COBRADO")).toBeVisible();
    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50").first()).toBeVisible();
    await expect.element(screen.getByText("Falta cobrar")).not.toBeInTheDocument();
  });

  it("shows what is still to be charged after a partial payment", async () => {
    const { screen } = await renderPanel(176_000);

    await expect.element(screen.getByText("Falta cobrar")).toBeVisible();
    await expect.element(screen.getByText("$ 1.760,00")).toBeVisible();
  });

  it("shows the extra step it is given", async () => {
    const { screen } = await renderPanel(undefined, <p>Verificar el comprobante</p>);

    await expect.element(screen.getByText("Verificar el comprobante")).toBeVisible();
  });

  it("continues from the Continuar button, which shows its Enter key", async () => {
    const { screen, onContinue } = await renderPanel(undefined);
    await expect
      .element(screen.getByRole("button", { name: "Continuar" }).getByText("Enter"))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("continues with Enter", async () => {
    const { screen, onContinue } = await renderPanel(undefined);
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeVisible();

    await userEvent.keyboard("{Enter}");

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("cannot be closed: it has no close button and ignores Esc", async () => {
    const { screen, onContinue } = await renderPanel(undefined);

    await userEvent.keyboard("{Escape}");

    expect(
      screen
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["ContinuarEnter"]);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderPanel(176_000);

    await expectNoAccessibilityViolations(screen.container);
  });
});
