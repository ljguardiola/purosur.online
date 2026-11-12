import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { OtherChargeMethodsPanel } from "./other-charge-methods-panel";

async function renderPanel() {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onBack = vi.fn();
  const onChoose = vi.fn();
  const screen = await render(
    <OtherChargeMethodsPanel
      pending={2_519_250}
      paidOrderNotice={<p>Pago de Mercado Pago pendiente</p>}
      onBack={onBack}
      onChoose={onChoose}
    />,
  );
  return { screen, onBack, onChoose };
}

describe("OtherChargeMethodsPanel", () => {
  it("shows the title, what is to be charged and the two methods, each with its key", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Transferencia" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Terminal independiente" }))
      .toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "1", "2"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the notice it is given", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("Pago de Mercado Pago pendiente")).toBeVisible();
  });

  it("opens the transfer with 1 and with its card", async () => {
    const { screen, onChoose } = await renderPanel();

    await userEvent.keyboard("1");
    await screen.getByRole("button", { name: "Transferencia" }).click();

    expect(onChoose.mock.calls).toEqual([["TRANSFER"], ["TRANSFER"]]);
  });

  it("opens the independent terminal with 2 and with its card", async () => {
    const { screen, onChoose } = await renderPanel();

    await userEvent.keyboard("2");
    await screen.getByRole("button", { name: "Terminal independiente" }).click();

    expect(onChoose.mock.calls).toEqual([["STANDALONE_TERMINAL"], ["STANDALONE_TERMINAL"]]);
  });

  it("goes back with Esc and from its close button", async () => {
    const { screen, onBack } = await renderPanel();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
