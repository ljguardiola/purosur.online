import { expect, test } from "vitest";
import { paymentLabel, paymentLabelInSentence } from "./payment-label";

test.each([
  ["POINT", "DEBIT", "Point · Débito"],
  ["POINT", "CREDIT", "Point · Crédito"],
  ["POINT", null, "Point integrada"],
  ["CASH", null, "Efectivo"],
  ["QR", null, "QR de Mercado Pago"],
] as const)("names a %s payment with card type %s as %s", (method, cardType, label) => {
  expect(paymentLabel(method, cardType)).toBe(label);
});

test.each([
  ["POINT", "DEBIT", "Point · Débito"],
  ["POINT", "CREDIT", "Point · Crédito"],
  ["POINT", null, "point integrada"],
  ["TRANSFER", null, "transferencia"],
] as const)(
  "names a %s payment with card type %s inside a sentence as %s",
  (method, cardType, label) => {
    expect(paymentLabelInSentence(method, cardType)).toBe(label);
  },
);
