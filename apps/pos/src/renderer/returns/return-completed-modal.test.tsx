import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompletedReturnLine } from "./return-completed-modal";
import { ReturnCompletedModal } from "./return-completed-modal";

const LINES: CompletedReturnLine[] = [
  {
    id: "line-pasta",
    name: "Pasta de maní 380 g",
    quantity: "3 u",
    disposition: "restock",
    amount: 970_000,
  },
  {
    id: "line-nibs",
    name: "Nibs de cacao",
    quantity: "0,350 kg",
    disposition: "discard",
    amount: 423_500,
  },
];

async function renderModal() {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onDone = vi.fn();
  const screen = await render(
    <ReturnCompletedModal refundedTotal={1_393_500} lines={LINES} onDone={onDone} />,
  );
  return { screen, onDone };
}

describe("ReturnCompletedModal", () => {
  it("tells the cashier to hand the money to the customer", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("DEVOLUCIÓN COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Entregá el dinero al cliente" }))
      .toBeVisible();
  });

  it("shows the cash to give back, from the payment in cash", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("DEVOLVÉ EN EFECTIVO")).toBeVisible();
    await expect.element(screen.getByText("Por el pago en efectivo")).toBeVisible();
    await expect.element(screen.getByText("$ 13.935,00")).toBeVisible();
  });

  it("lists each returned line with its quantity, what happens to it and its refund", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("Pasta de maní 380 g · 3 u")).toBeVisible();
    await expect.element(screen.getByText("Reintegro · vuelve a la venta")).toBeVisible();
    await expect.element(screen.getByText("$ 9.700,00")).toBeVisible();
    await expect.element(screen.getByText("Nibs de cacao · 0,350 kg")).toBeVisible();
    await expect.element(screen.getByText("Reintegro · se descarta")).toBeVisible();
    await expect.element(screen.getByText("$ 4.235,00")).toBeVisible();
  });

  it("is done with the button", async () => {
    const { screen, onDone } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Listo" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations", async () => {
    await renderModal();

    await expectNoAccessibilityViolations(document.body);
  });
});
