import { describe, expect, it } from "vitest";
import {
  comprobantePresentation,
  operationText,
  paymentMethodName,
  paymentMethodsText,
  receiptCopyPresentation,
  saleStatePresentation,
} from "./sale-history-text";

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

describe("operationText", () => {
  it("shows the operation number padded to six digits", () => {
    expect(operationText(482)).toBe("Operación 000482");
  });
});

describe("paymentMethodsText", () => {
  it("names the methods of the sale in Spanish, joined with a plus", () => {
    expect(paymentMethodsText(["CASH"])).toBe("Efectivo");
    expect(paymentMethodsText(["TRANSFER", "CASH"])).toBe("Transferencia + Efectivo");
  });

  it("names a Mercado Pago QR payment as QR", () => {
    expect(paymentMethodsText(["QR", "CASH"])).toBe("QR + Efectivo");
  });

  it("is a dash when the sale has no payment", () => {
    expect(paymentMethodsText([])).toBe("—");
  });
});

describe("paymentMethodName", () => {
  it.each([
    ["CASH", "Efectivo"],
    ["TRANSFER", "Transferencia"],
    ["QR", "QR de Mercado Pago"],
  ] as const)("names %s as %s", (method, name) => {
    expect(paymentMethodName(method)).toBe(name);
  });
});

describe("saleStatePresentation", () => {
  it.each([
    ["completed", "Completada", "success"],
    ["in_progress", "En trámite", "info"],
    ["deferred", "Diferida", "neutral"],
  ] as const)("shows %s as %s", (state, label, tone) => {
    expect(saleStatePresentation(state)).toEqual({ label, tone });
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
});
