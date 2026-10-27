import { describe, expect, it } from "vitest";
import { paymentMethodName, pointCardName } from "./payment-method-names";

describe("paymentMethodName", () => {
  it.each([
    ["CASH", "Efectivo"],
    ["TRANSFER", "Transferencia"],
    ["QR", "QR de Mercado Pago"],
    ["POINT", "Point"],
    ["STANDALONE_TERMINAL", "Terminal independiente"],
  ] as const)("names %s as %s", (method, name) => {
    expect(paymentMethodName(method)).toBe(name);
  });
});

describe("pointCardName", () => {
  it.each([
    ["DEBIT", "Point · Débito"],
    ["CREDIT", "Point · Crédito"],
    [null, "Point"],
  ] as const)("names a %s card charge as %s", (cardType, name) => {
    expect(pointCardName(cardType)).toBe(name);
  });
});
