import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { SaleForReturn } from "./return-sale";
import { SALE } from "./test-support/sale-for-return";
import { TicketConfirmationModal } from "./ticket-confirmation-modal";

async function renderModal(sale: SaleForReturn = SALE, registerName: string | null = "Caja 1") {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onConfirm = vi.fn();
  const onReject = vi.fn();
  const screen = await render(
    <TicketConfirmationModal
      sale={sale}
      registerName={registerName}
      onConfirm={onConfirm}
      onReject={onReject}
    />,
  );
  return { screen, onConfirm, onReject };
}

describe("TicketConfirmationModal", () => {
  it("asks whether the sale found is the one on the paper ticket", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("VENTA ENCONTRADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Coincide con el ticket en papel?" }))
      .toBeVisible();
  });

  it("shows the date and the total of the sale to check against the paper", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("12/09/2026 · 11:42")).toBeVisible();
    await expect.element(screen.getByText("$ 25.335,00")).toBeVisible();
  });

  it("shows the invoice, the register and how many lines the sale has", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("Factura C · PV 00003 · N° 00001192")).toBeVisible();
    await expect.element(screen.getByText("Caja 1")).toBeVisible();
    await expect.element(screen.getByText("4 líneas")).toBeVisible();
  });

  it("leaves out the invoice of a sale that has none, and the register when it has no name", async () => {
    const { screen } = await renderModal({ ...SALE, invoice: null }, null);

    await expect.element(screen.getByText("Comprobante")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Caja")).not.toBeInTheDocument();
  });

  it("goes on with the return when the sale matches", async () => {
    const { screen, onConfirm, onReject } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onReject).not.toHaveBeenCalled();
  });

  it("drops the sale when it does not match", async () => {
    const { screen, onConfirm, onReject } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "No coincide" }));

    expect(onReject).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("drops the sale when it is closed", async () => {
    const { onReject } = await renderModal();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(onReject).toHaveBeenCalledOnce());
  });

  it("has no accessibility violations", async () => {
    await renderModal();

    await expectNoAccessibilityViolations(document.body);
  });
});
