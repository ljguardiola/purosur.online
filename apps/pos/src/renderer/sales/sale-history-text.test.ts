import { describe, expect, it } from "vitest";
import {
  comprobanteLine,
  comprobanteRow,
  documentNumberText,
  paymentMethodsText,
  paymentRowName,
  saleStatePresentation,
} from "./sale-history-text";

describe("paymentMethodsText", () => {
  it("names the methods of the sale in Spanish, joined with a middle dot", () => {
    expect(paymentMethodsText(["CASH"])).toBe("Efectivo");
    expect(paymentMethodsText(["TRANSFER", "CASH"])).toBe("Transferencia · Efectivo");
  });

  it("names a Mercado Pago QR payment as QR", () => {
    expect(paymentMethodsText(["QR", "CASH"])).toBe("QR · Efectivo");
  });

  it("names a Mercado Pago terminal payment as Point", () => {
    expect(paymentMethodsText(["POINT", "CASH"])).toBe("Point · Efectivo");
  });

  it("names a standalone terminal payment as Terminal independiente", () => {
    expect(paymentMethodsText(["STANDALONE_TERMINAL", "CASH"])).toBe(
      "Terminal independiente · Efectivo",
    );
  });

  it("is a dash when the sale has no payment", () => {
    expect(paymentMethodsText([])).toBe("—");
  });
});

describe("saleStatePresentation", () => {
  it.each([
    ["completed", "Completada", "success"],
    ["in_progress", "En trámite", "info"],
    ["deferred", "Diferida", "warning"],
    ["voided", "Anulada", "error"],
  ] as const)("shows %s as %s", (state, label, tone) => {
    expect(saleStatePresentation(state)).toEqual({ label, tone });
  });
});

describe("documentNumberText", () => {
  it("joins the point of sale and the number, each padded", () => {
    expect(documentNumberText({ point_of_sale: 3, number: 1234 })).toBe("00003-00001234");
  });
});

describe("comprobanteLine", () => {
  it("names a factura C with its point of sale and number on one line", () => {
    expect(
      comprobanteLine({
        kind: "fiscal",
        document_type: "factura_c",
        authorization: "real_time",
        point_of_sale: 3,
        number: 1234,
      }),
    ).toBe("Factura C · 00003-00001234");
  });

  it("names a factura authorized under the pre-obtained code", () => {
    expect(
      comprobanteLine({
        kind: "fiscal",
        document_type: "factura_c",
        authorization: "offline_code",
        point_of_sale: 3,
        number: 1234,
      }),
    ).toBe("Factura C · CAEA · 00003-00001234");
  });

  it("names the document of a deferred sale as not fiscal", () => {
    expect(comprobanteLine({ kind: "deferred_non_fiscal" })).toBe("Documento no fiscal");
  });

  it("is a dash when the sale has no comprobante", () => {
    expect(comprobanteLine({ kind: "none" })).toBe("—");
  });
});

describe("comprobanteRow", () => {
  it("names the factura and gives its number", () => {
    expect(
      comprobanteRow({
        kind: "fiscal",
        document_type: "factura_c",
        authorization: "real_time",
        point_of_sale: 3,
        number: 1234,
      }),
    ).toEqual({ label: "Factura C", value: "00003-00001234" });
  });

  it("says a deferred sale is still to be invoiced", () => {
    expect(comprobanteRow({ kind: "deferred_non_fiscal" })).toEqual({
      label: "Documento no fiscal",
      value: "Venta diferida · falta facturar",
    });
  });

  it("has no row when the sale has no comprobante", () => {
    expect(comprobanteRow({ kind: "none" })).toBeUndefined();
  });
});

describe("paymentRowName", () => {
  it.each([
    ["CASH", null, "Efectivo"],
    ["QR", null, "QR"],
    ["POINT", "DEBIT", "Point débito"],
    ["POINT", "CREDIT", "Point crédito"],
    ["POINT", null, "Point"],
    ["TRANSFER", null, "Transferencia"],
  ] as const)("names %s with card %s as %s", (method, cardType, name) => {
    expect(paymentRowName(method, cardType)).toBe(name);
  });
});
