import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { chooseSale, DETAIL, renderScreen } from "./test-support/sales-history-screen";

const INVOICED_DETAIL = {
  ...DETAIL,
  deferred_invoice_next_copy: { kind: "duplicate", order_number: 1 },
} as const;

const REPRINT_INVOICE = "Reimprimir factura";

describe("SalesHistoryScreen factura of a sale that was deferred", () => {
  it("asks the reason and names the factura in the reprint it opens", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: INVOICED_DETAIL }),
    });
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: REPRINT_INVOICE }));

    await expect
      .element(screen.getByText("REIMPRIMIR FACTURA DE LA VENTA DE LAS 11:42"))
      .toBeVisible();
    await expect.element(screen.getByText("COPIA DUPLICADA Nº 1")).toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("Factura C · PV 00003 · Nº 00001248"))
      .toBeVisible();
  });

  it("reprints the factura, not the sale's receipt, and says it comes out once the printer is ready", async () => {
    const { screen, reprintDeferredSaleInvoice, reprintSaleReceipt } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: INVOICED_DETAIL }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: REPRINT_INVOICE }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "El cliente la perdió",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    expect(reprintDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "El cliente la perdió",
      undefined,
    );
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
    await expect
      .element(
        screen.getByText("La reimpresión de la factura sale en cuanto la impresora esté lista"),
      )
      .toBeVisible();
  });

  it("stops showing the sale when the core cannot find it", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: INVOICED_DETAIL }),
      reprintDeferredSaleInvoice: async () => ({ kind: "not_found" }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: REPRINT_INVOICE }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
  });

  it("closes the reprint without printing from Cancelar", async () => {
    const { screen, reprintDeferredSaleInvoice } = await renderScreen({
      saleHistoryDetail: async () => ({ kind: "found", detail: INVOICED_DETAIL }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: REPRINT_INVOICE }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect
      .element(screen.getByText("REIMPRIMIR FACTURA DE LA VENTA DE LAS 11:42"))
      .not.toBeInTheDocument();
    expect(reprintDeferredSaleInvoice).not.toHaveBeenCalled();
  });
});
