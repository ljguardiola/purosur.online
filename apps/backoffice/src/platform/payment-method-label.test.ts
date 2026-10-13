import { expect, test } from "vitest";
import { paymentMethodLabel } from "./payment-method-label";

test.each([
  ["CASH", "Efectivo"],
  ["TRANSFER", "Transferencia"],
  ["QR", "QR de Mercado Pago"],
  ["POINT", "Point integrada"],
] as const)("names the %s payment method %s", (method, label) => {
  expect(paymentMethodLabel(method)).toBe(label);
});
