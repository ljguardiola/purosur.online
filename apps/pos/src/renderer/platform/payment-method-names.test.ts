import { describe, expect, it } from "vitest";
import { paymentMethodName } from "./payment-method-names";

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
