import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { SaleDetail } from "../shell/sale-receipt-text";
import {
  DETAIL,
  detailPanel,
  FISCAL_ROW,
  legendOf,
  pageOf,
  renderScreen,
  searchField,
} from "./test-support/sales-history-screen";

const DEFERRED: SaleDetail = {
  ...DETAIL,
  sale_id: "sale-1",
  state: "deferred",
  comprobante: { kind: "deferred_non_fiscal" },
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  next_copy: { kind: "original" },
};

async function renderDeferred(options: Parameters<typeof renderScreen>[0] = {}) {
  const rendered = await renderScreen({
    saleHistoryDetail: async () => ({ kind: "found", detail: DEFERRED }),
    ...options,
  });
  await expect.element(detailPanel(rendered.screen).getByText("Documento no fiscal")).toBeVisible();
  return rendered;
}

describe("SalesHistoryScreen invoice of a deferred sale", () => {
  it("shows the sale's day, comprobante and articles and not who served it", async () => {
    const { screen } = await renderDeferred();

    await userEvent.type(searchField(screen), "0003-00000187");

    const panel = detailPanel(screen);
    await expect.element(panel.getByText("Venta del", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Comprobante", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Artículos", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Atendió")).not.toBeInTheDocument();
  });

  it("has the Imprimir factura button with the Enter key and no reprint", async () => {
    const { screen } = await renderDeferred();

    const panel = detailPanel(screen);
    await expect
      .element(panel.getByRole("button", { name: "Imprimir factura" }).getByText("Enter"))
      .toBeVisible();
    await expect.element(panel.getByRole("button", { name: /Reimprimir/ })).not.toBeInTheDocument();
  });

  it("prints it directly on Enter and says it comes out as soon as the printer is ready", async () => {
    const { screen, printDeferredSaleInvoice, saleHistoryDetail } = await renderDeferred();

    await userEvent.keyboard("{Enter}");

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
    await expect
      .element(screen.getByText("La factura sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBeGreaterThan(1);
  });

  it("prints it from the button", async () => {
    const { screen, printDeferredSaleInvoice } = await renderDeferred();

    await userEvent.click(detailPanel(screen).getByRole("button", { name: "Imprimir factura" }));

    expect(printDeferredSaleInvoice).toHaveBeenCalledOnce();
  });

  it("sends one request while the first is being answered", async () => {
    const answer = deferred<{ kind: "started"; copy: { kind: "original" } }>();
    const { printDeferredSaleInvoice } = await renderDeferred({
      printDeferredSaleInvoice: () => answer.promise,
    });

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    answer.resolve({ kind: "started", copy: { kind: "original" } });

    expect(printDeferredSaleInvoice).toHaveBeenCalledOnce();
  });

  it.each([
    ["cannot_authorize", "La caja no puede pedir facturas a ARCA ahora."],
    ["older_sale_blocking", "Una venta anterior está frenando la facturación."],
    ["not_authorized", "ARCA no autorizó la factura de esta venta"],
  ] as const)("says it cannot be invoiced yet when %s", async (cause, description) => {
    const { screen } = await renderDeferred({
      printDeferredSaleInvoice: async () => ({ kind: "not_yet", cause }),
    });

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("Todavía no se puede facturar").first()).toBeVisible();
    await expect.element(screen.getByText(new RegExp(description)).first()).toBeVisible();
  });

  it.each([
    ["already_printed", "La factura ya se imprimió"],
    ["voided", "Esa venta se anuló"],
    ["sale_voided", "Esa venta se anuló"],
    ["expired", "Pasó el plazo para facturar esta venta"],
    ["out_of_date_order", "Esta venta ya no se puede facturar"],
  ] as const)("says why it was refused on %s and reads the sales again", async (kind, title) => {
    const { screen, salesHistory } = await renderDeferred({
      printDeferredSaleInvoice: async () => ({ kind }),
    });

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.poll(() => salesHistory.mock.calls.length).toBe(2);
  });

  it.each([
    ["busy", "Todavía puede salir una impresión de esta venta"],
    ["printer_not_configured", "La impresora no está configurada"],
    ["lacks_permission", "No tenés permiso para imprimir la factura"],
    ["unavailable", "No se pudo imprimir la factura"],
  ] as const)("says why it was not printed on %s", async (kind, title) => {
    const { screen } = await renderDeferred({ printDeferredSaleInvoice: async () => ({ kind }) });

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(title)).toBeVisible();
  });

  it("says it was not printed when the core cannot be reached", async () => {
    const { screen } = await renderDeferred({
      printDeferredSaleInvoice: () => Promise.reject(new Error("gone")),
    });

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("No se pudo imprimir la factura")).toBeVisible();
  });

  it("tells the route the session is no longer valid when printing finds nobody signed in", async () => {
    const { onSessionInvalid } = await renderDeferred({
      printDeferredSaleInvoice: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("prints the invoice of a deferred sale found by its number with Enter, once the core issued it unprinted", async () => {
    const { screen, salesHistory, printDeferredSaleInvoice } = await renderScreen({
      salesHistory: async () => pageOf([FISCAL_ROW]),
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: {
          ...DETAIL,
          voidability: { kind: "not_voidable", refusal: "not_completed" },
          deferred_invoice_next_copy: { kind: "original" },
        },
      }),
    });

    await userEvent.type(searchField(screen), "0003-00001248");
    await expect
      .poll(() => salesHistory.mock.calls.at(-1)?.[0].search)
      .toEqual({ kind: "typed", pointOfSale: 3, number: 1248 });
    await expect
      .element(detailPanel(screen).getByRole("button", { name: "Imprimir factura" }))
      .toBeVisible();
    await expect
      .poll(() => legendOf(screen))
      .toEqual(["↑↓Ventas", "F2Buscar", "EnterImprimir factura"]);

    await userEvent.keyboard("{Enter}");

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
  });
});
