import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { authorizationDialog } from "../shell/test-support/authorization-modal-steps";
import {
  FOUND_ISSUED,
  FOUND_PENDING,
  QR_TEXT,
  renderScreen,
} from "./test-support/deferred-sale-screen";

const REPRINT = "Reimprimir duplicado";
const PRINTED = { ...FOUND_ISSUED, original_printed: true } as const;

async function findPrinted(overrides: Parameters<typeof renderScreen>[0] = {}) {
  const rendered = await renderScreen({
    reading: QR_TEXT,
    findDeferredSale: async () => PRINTED,
    ...overrides,
  });
  await expect.element(rendered.screen.getByText("La factura ya se imprimió")).toBeVisible();
  return rendered;
}

describe("DeferredSaleScreen reprinting a factura already printed", () => {
  it("offers the duplicate beside the notice that the factura was already printed", async () => {
    const { screen } = await findPrinted();

    await expect.element(screen.getByText("La factura ya se imprimió")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: REPRINT })).toBeVisible();
  });

  it.each([
    ["not yet invoiced", FOUND_PENDING],
    ["invoiced and not printed", FOUND_ISSUED],
  ])("offers no duplicate for a sale %s", async (_case, outcome) => {
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => outcome,
    });

    await expect.element(screen.getByRole("button", { name: "Imprimir factura" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: REPRINT })).not.toBeInTheDocument();
  });

  it("offers the duplicate once printing from the board finds the factura already printed", async () => {
    const findDeferredSale = vi
      .fn()
      .mockResolvedValueOnce(FOUND_ISSUED)
      .mockResolvedValueOnce(PRINTED);
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale,
      printDeferredSaleInvoice: async () => ({ kind: "already_printed" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await expect.element(screen.getByText("La factura ya se imprimió")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: REPRINT })).toBeVisible();
    expect(findDeferredSale).toHaveBeenNthCalledWith(2, { kind: "scanned", text: QR_TEXT });
  });

  it("opens the reprint of the factura with the sale's time and comprobante", async () => {
    const { screen } = await findPrinted();

    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    await expect
      .element(screen.getByText("REIMPRIMIR FACTURA DE LA VENTA DE LAS 14:02"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("Factura C · PV 00003 · Nº 00000187"))
      .toBeVisible();
  });

  it("reprints the factura with the typed reason and says it comes out once the printer is ready", async () => {
    const { screen, reprintDeferredSaleInvoice } = await findPrinted();
    await userEvent.click(screen.getByRole("button", { name: REPRINT }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "El cliente la perdió",
    );

    await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: REPRINT }));

    expect(reprintDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "El cliente la perdió",
      undefined,
    );
    await expect
      .element(
        screen.getByText("La reimpresión de la factura sale en cuanto la impresora esté lista"),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks another person's authorization from a cashier who may not reprint", async () => {
    const { screen } = await findPrinted({
      person: { user_id: "u1", first_name: "Tomás", abilities: ["invoice_deferred_sale"] },
    });

    await userEvent.click(screen.getByRole("button", { name: REPRINT }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );
    await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: REPRINT }));

    await expect
      .element(authorizationDialog().getByText("Reimprimir comprobante", { exact: true }))
      .toBeVisible();
  });

  it("closes the reprint without printing from Cancelar", async () => {
    const { screen, reprintDeferredSaleInvoice } = await findPrinted();
    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(reprintDeferredSaleInvoice).not.toHaveBeenCalled();
  });

  it("shows the sale as not found when the core cannot find it any more", async () => {
    const { screen } = await findPrinted({
      reprintDeferredSaleInvoice: async () => ({ kind: "not_found" }),
    });
    await userEvent.click(screen.getByRole("button", { name: REPRINT }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );

    await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: REPRINT }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("La factura ya se imprimió")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("No hay una venta diferida con ese código en esta caja"))
      .toBeVisible();
  });

  it("keeps the printed sale's lines and totals on the board beside the notice", async () => {
    const { screen } = await findPrinted();

    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    await expect.element(screen.getByText("$ 16.400,00")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Imprimir factura" }))
      .not.toBeInTheDocument();
  });
});
