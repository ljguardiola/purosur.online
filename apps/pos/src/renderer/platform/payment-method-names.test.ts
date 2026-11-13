import { describe, expect, it } from "vitest";
import {
  paidPaymentName,
  paymentMethodName,
  pointCardName,
  pointCardTitle,
} from "./payment-method-names";

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

describe("pointCardTitle", () => {
  it.each([
    ["DEBIT", "Point débito"],
    ["CREDIT", "Point crédito"],
    [null, "Point"],
  ] as const)("titles a %s card charge panel as %s", (cardType, title) => {
    expect(pointCardTitle(cardType)).toBe(title);
  });
});

describe("paidPaymentName", () => {
  it.each([
    ["POINT", "DEBIT", "Point · Débito"],
    ["POINT", "CREDIT", "Point · Crédito"],
    ["POINT", null, "Point"],
    ["CASH", null, "Efectivo"],
    ["QR", null, "QR de Mercado Pago"],
  ] as const)("names a %s payment of card type %s as %s", (method, cardType, name) => {
    expect(paidPaymentName(method, cardType)).toBe(name);
  });
});
