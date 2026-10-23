import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { FOUND_ISSUED, FOUND_PENDING, renderScreen } from "./test-support/deferred-sale-screen";

const SEARCH = "Buscar venta";
const REPRINT = "Reimprimir duplicado";
const PRINTED = { ...FOUND_ISSUED, original_printed: true } as const;

async function findPrinted(overrides: Parameters<typeof renderScreen>[0] = {}) {
  const rendered = await renderScreen({ findDeferredSale: async () => PRINTED, ...overrides });
  await userEvent.fill(rendered.codeField, "7KQ4-M2P9");
  await userEvent.click(rendered.screen.getByRole("button", { name: SEARCH }));
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
    const { screen, codeField } = await renderScreen({ findDeferredSale: async () => outcome });

    await userEvent.fill(codeField, "7KQ4-M2P9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));

    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: REPRINT })).not.toBeInTheDocument();
  });

  it("opens the reprint of the factura with the sale's time and comprobante", async () => {
    const { screen } = await findPrinted();

    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    await expect
      .element(screen.getByText("REIMPRIMIR FACTURA DE LA VENTA DE LAS 10:20"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("Factura C · PV 00003 · Nº 00001250"))
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

    await expect
      .element(screen.getByRole("button", { name: /Persona que autoriza/ }))
      .toBeVisible();
  });

  it("closes the reprint without printing from Cancelar", async () => {
    const { screen, reprintDeferredSaleInvoice } = await findPrinted();
    await userEvent.click(screen.getByRole("button", { name: REPRINT }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(reprintDeferredSaleInvoice).not.toHaveBeenCalled();
  });

  it("goes back to looking sales up when the core cannot find the sale any more", async () => {
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
  });
});
