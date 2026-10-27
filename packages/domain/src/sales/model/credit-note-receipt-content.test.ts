import { describe, expect, it } from "vitest";
import { returnedReceiptLine } from "./credit-note-receipt-content.js";
import type { ReceiptContent } from "./receipt-content.js";

const ALFAJOR: ReceiptContent["lines"][number] = {
  productName: "Alfajor",
  saleUnit: "UNIT",
  quantity: 2,
  listUnitPrice: 4200,
  chargedUnitPrice: 4200,
  manualAdjustment: null,
  promotion: null,
  discountAmount: 0,
  lineTotal: 8400,
};

describe("returnedReceiptLine", () => {
  it("reads the units given back at the price they were charged, with the refund as its amount and the rest as its discount", () => {
    expect(returnedReceiptLine(ALFAJOR, { quantity: 1, refundedAmount: 3780 })).toEqual({
      ...ALFAJOR,
      quantity: 1,
      discountAmount: 420,
      lineTotal: 3780,
    });
  });

  it("carries no discount when the refund is the whole amount the units given back were charged", () => {
    expect(returnedReceiptLine(ALFAJOR, { quantity: 2, refundedAmount: 8400 })).toMatchObject({
      quantity: 2,
      discountAmount: 0,
      lineTotal: 8400,
    });
  });

  it("keeps the price a person set by hand and the promotion the line was sold with", () => {
    const adjusted: ReceiptContent["lines"][number] = {
      ...ALFAJOR,
      quantity: 3,
      chargedUnitPrice: 3000,
      manualAdjustment: { kind: "PRICE", unitPrice: 3000 },
      promotion: { name: "Lleve 3 pague 2" },
      discountAmount: 3000,
      lineTotal: 6000,
    };

    expect(returnedReceiptLine(adjusted, { quantity: 3, refundedAmount: 6000 })).toEqual({
      ...adjusted,
      discountAmount: 3000,
      lineTotal: 6000,
    });
  });

  it("reads the weight given back of a weighed line as its share of the amount the line was charged before discounts", () => {
    const cheese: ReceiptContent["lines"][number] = {
      ...ALFAJOR,
      productName: "Queso cremoso",
      saleUnit: "KG",
      quantity: 1500,
      chargedUnitPrice: 2000,
      discountAmount: 300,
      lineTotal: 2700,
    };

    expect(returnedReceiptLine(cheese, { quantity: 500, refundedAmount: 900 })).toMatchObject({
      quantity: 500,
      discountAmount: 100,
      lineTotal: 900,
    });
  });

  it("rounds a share of half a cent up", () => {
    const line = { ...ALFAJOR, quantity: 2, discountAmount: 0, lineTotal: 5 };

    expect(returnedReceiptLine(line, { quantity: 1, refundedAmount: 2 })).toMatchObject({
      discountAmount: 1,
      lineTotal: 2,
    });
  });

  it("rounds a share under half a cent down", () => {
    const line = { ...ALFAJOR, quantity: 3, discountAmount: 0, lineTotal: 1000 };

    expect(returnedReceiptLine(line, { quantity: 1, refundedAmount: 300 })).toMatchObject({
      discountAmount: 33,
      lineTotal: 300,
    });
  });
});
