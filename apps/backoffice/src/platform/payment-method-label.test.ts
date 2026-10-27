import { expect, test } from "vitest";
import { paymentLabel, paymentMethodLabel } from "./payment-method-label";

test.each([
  ["CASH", "Efectivo"],
  ["TRANSFER", "Transferencia"],
  ["QR", "QR de Mercado Pago"],
  ["POINT", "Point integrada"],
  ["STANDALONE_TERMINAL", "Terminal independiente"],
] as const)("names the %s payment method %s", (method, label) => {
  expect(paymentMethodLabel(method)).toBe(label);
});

test.each([
  ["POINT", "DEBIT", "Point · Débito"],
  ["POINT", "CREDIT", "Point · Crédito"],
  ["POINT", null, "Point integrada"],
  ["CASH", null, "Efectivo"],
  ["QR", null, "QR de Mercado Pago"],
] as const)("names a %s payment with card type %s as %s", (method, cardType, label) => {
  expect(paymentLabel(method, cardType)).toBe(label);
});
