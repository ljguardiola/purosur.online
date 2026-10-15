import { describe, expect, it } from "vitest";
import {
  operationText,
  paymentMethodName,
  paymentMethodsText,
  saleStatePresentation,
} from "./sale-history-text";

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

  it("names a Mercado Pago terminal payment as Point", () => {
    expect(paymentMethodsText(["POINT", "CASH"])).toBe("Point + Efectivo");
  });

  it("names a standalone terminal payment as Terminal independiente", () => {
    expect(paymentMethodsText(["STANDALONE_TERMINAL", "CASH"])).toBe(
      "Terminal independiente + Efectivo",
    );
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
    ["POINT", "Point integrada"],
    ["STANDALONE_TERMINAL", "Terminal independiente"],
  ] as const)("names %s as %s", (method, name) => {
    expect(paymentMethodName(method)).toBe(name);
  });
});

describe("saleStatePresentation", () => {
  it.each([
    ["completed", "Completada", "success"],
    ["in_progress", "En trámite", "info"],
    ["deferred", "Diferida", "neutral"],
    ["voided", "Anulada", "neutral"],
  ] as const)("shows %s as %s", (state, label, tone) => {
    expect(saleStatePresentation(state)).toEqual({ label, tone });
  });
});
