import { expect, test } from "vitest";
import { paymentLabel } from "./payment-label";

test.each([
  ["POINT", "DEBIT", "Point · Débito"],
  ["POINT", "CREDIT", "Point · Crédito"],
  ["POINT", null, "Point integrada"],
  ["CASH", null, "Efectivo"],
  ["QR", null, "QR de Mercado Pago"],
] as const)("names a %s payment with card type %s as %s", (method, cardType, label) => {
  expect(paymentLabel(method, cardType)).toBe(label);
});
