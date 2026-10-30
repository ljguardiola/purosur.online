import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompletedReturnLine, PendingReturnRefund } from "./hand-over-refund-modal";
import { HandOverRefundModal } from "./hand-over-refund-modal";

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

const PENDING_QR: PendingReturnRefund = {
  id: "pay-qr",
  name: "QR de Mercado Pago",
  amount: 793_500,
  sentByCloud: true,
};
const PENDING_TRANSFER: PendingReturnRefund = {
  id: "pay-transfer",
  name: "Transferencia",
  amount: 600_000,
  sentByCloud: false,
};

async function renderModal(
  cashToHandOver = 1_393_500,
  pendingRefunds: readonly PendingReturnRefund[] = [],
) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onDone = vi.fn();
  const screen = await render(
    <HandOverRefundModal
      cashToHandOver={cashToHandOver}
      pendingRefunds={pendingRefunds}
      lines={LINES}
      onDone={onDone}
    />,
  );
  return { screen, onDone };
}

describe("HandOverRefundModal", () => {
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

  it("lists no pending refund when everything goes back in cash", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("REEMBOLSOS PENDIENTES")).not.toBeInTheDocument();
  });

  it("shows only the cash part to hand over, and lists each refund that stays pending with who makes it", async () => {
    const { screen } = await renderModal(600_000, [PENDING_QR, PENDING_TRANSFER]);

    await expect
      .element(screen.getByRole("heading", { name: "Entregá el dinero al cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("$ 6.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("REEMBOLSOS PENDIENTES")).toBeVisible();
    await expect.element(screen.getByText("QR de Mercado Pago · $ 7.935,00")).toBeVisible();
    await expect.element(screen.getByText("La nube lo envía a Mercado Pago.")).toBeVisible();
    await expect.element(screen.getByText("Transferencia · $ 6.000,00")).toBeVisible();
    await expect
      .element(screen.getByText("Lo hace una persona por fuera de la caja."))
      .toBeVisible();
  });

  it("says once that the refunds stay pending", async () => {
    const { screen } = await renderModal(0, [PENDING_QR, PENDING_TRANSFER]);

    await expect.element(screen.getByText("REEMBOLSOS PENDIENTES")).toBeVisible();
    expect(screen.getByText(/pendiente/i).elements()).toHaveLength(1);
  });

  it("says nothing about cash when the whole refund stays pending", async () => {
    const { screen } = await renderModal(0, [PENDING_TRANSFER]);

    await expect
      .element(screen.getByRole("heading", { name: "El dinero vuelve por cada medio de pago" }))
      .toBeVisible();
    await expect.element(screen.getByText("DEVOLVÉ EN EFECTIVO")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Entregá el dinero al cliente")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Transferencia · $ 6.000,00")).toBeVisible();
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

  it("has no accessibility violations with refunds that stay pending", async () => {
    await renderModal(600_000, [PENDING_QR, PENDING_TRANSFER]);

    await expectNoAccessibilityViolations(document.body);
  });
});
