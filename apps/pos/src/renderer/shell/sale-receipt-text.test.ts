import { describe, expect, it } from "vitest";
import { comprobantePresentation, receiptCopyPresentation } from "./sale-receipt-text";

describe("comprobantePresentation", () => {
  it("names a fiscal invoice with its point of sale and number padded to the digits the tax authority prints", () => {
    expect(
      comprobantePresentation({
        kind: "fiscal",
        document_type: "factura_c",
        point_of_sale: 3,
        number: 1248,
      }),
    ).toEqual({ name: "Factura C", detail: "PV 00003 · Nº 00001248" });
  });

  it("names a deferred sale's document as not fiscal and says it still has to be invoiced", () => {
    expect(comprobantePresentation({ kind: "deferred_non_fiscal" })).toEqual({
      name: "Documento no fiscal",
      detail: "Venta diferida · falta facturar",
    });
  });

  it("has nothing to name when the sale has no comprobante", () => {
    expect(comprobantePresentation({ kind: "none" })).toBeUndefined();
  });
});

describe("receiptCopyPresentation", () => {
  it("says the next copy is an original, to be printed", () => {
    expect(receiptCopyPresentation({ kind: "original" })).toEqual({
      printButton: "Imprimir original",
      comesOutAs: "Sale como original",
      legend: undefined,
    });
  });

  it("says the next copy is a duplicate with the legend it carries and its reprint number", () => {
    expect(receiptCopyPresentation({ kind: "duplicate", order_number: 2 })).toEqual({
      printButton: "Reimprimir duplicado",
      comesOutAs: "Sale como duplicado",
      legend: "COPIA DUPLICADA Nº 2",
    });
  });

  it("carries no legend for a duplicate whose reprint number is not known yet", () => {
    expect(receiptCopyPresentation({ kind: "duplicate" })).toEqual({
      printButton: "Reimprimir duplicado",
      comesOutAs: "Sale como duplicado",
      legend: undefined,
    });
  });
});
