import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReceiptContent } from "../../sales/index.js";
import { returnedReceiptLine } from "./returned-receipt-line.js";

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
    expect(
      returnedReceiptLine(ALFAJOR, { returnedBefore: 0, quantity: 1, refundedAmount: 3780 }),
    ).toEqual({
      ...ALFAJOR,
      quantity: 1,
      discountAmount: 420,
      lineTotal: 3780,
    });
  });

  it("carries no discount when the refund is the whole amount the units given back were charged", () => {
    expect(
      returnedReceiptLine(ALFAJOR, { returnedBefore: 0, quantity: 2, refundedAmount: 8400 }),
    ).toMatchObject({
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

    expect(
      returnedReceiptLine(adjusted, { returnedBefore: 0, quantity: 3, refundedAmount: 6000 }),
    ).toEqual({
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

    expect(
      returnedReceiptLine(cheese, { returnedBefore: 0, quantity: 500, refundedAmount: 900 }),
    ).toMatchObject({
      quantity: 500,
      discountAmount: 100,
      lineTotal: 900,
    });
  });

  const WEIGHED: ReceiptContent["lines"][number] = {
    ...ALFAJOR,
    productName: "Queso cremoso",
    saleUnit: "KG",
    quantity: 300,
    listUnitPrice: 4003,
    chargedUnitPrice: 4003,
    discountAmount: 0,
    lineTotal: 1201,
  };

  it("reads a later return of a weighed line at the share it refunded once what earlier returns took out is counted", () => {
    expect(
      returnedReceiptLine(WEIGHED, { returnedBefore: 100, quantity: 100, refundedAmount: 401 }),
    ).toMatchObject({ quantity: 100, discountAmount: 0, lineTotal: 401 });
  });

  it("reads what the refund of a later return left out as its discount, from the share of the price before discounts the earlier returns left", () => {
    const discounted = { ...WEIGHED, discountAmount: 100, lineTotal: 1101 };

    expect(
      returnedReceiptLine(discounted, { returnedBefore: 100, quantity: 100, refundedAmount: 367 }),
    ).toMatchObject({ discountAmount: 34, lineTotal: 367 });
  });

  it("reads a first return of a weighed line at the share it refunded", () => {
    expect(
      returnedReceiptLine(WEIGHED, { returnedBefore: 0, quantity: 100, refundedAmount: 400 }),
    ).toMatchObject({ quantity: 100, discountAmount: 0, lineTotal: 400 });
  });

  it("carries no discount when the refund is more than the share of the price before discounts", () => {
    const discounted = { ...WEIGHED, chargedUnitPrice: 3337, discountAmount: 1, lineTotal: 1000 };

    expect(
      returnedReceiptLine(discounted, { returnedBefore: 100, quantity: 100, refundedAmount: 334 }),
    ).toMatchObject({ discountAmount: 0, lineTotal: 334 });
  });

  it("never carries a negative discount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000 }),
        fc.nat(100_000),
        fc.nat(100_000),
        fc.nat(5_000),
        fc.nat(5_000),
        fc.nat(100_000),
        (quantity, lineTotal, discountAmount, before, returned, refundedAmount) => {
          const line = { ...ALFAJOR, quantity, lineTotal, discountAmount };
          const returnedBefore = Math.min(before, quantity);
          const share = returnedReceiptLine(line, {
            returnedBefore,
            quantity: Math.min(returned, quantity - returnedBefore),
            refundedAmount,
          });

          expect(share.discountAmount).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("rounds a share of half a cent up", () => {
    const line = { ...ALFAJOR, quantity: 2, discountAmount: 0, lineTotal: 5 };

    expect(
      returnedReceiptLine(line, { returnedBefore: 0, quantity: 1, refundedAmount: 2 }),
    ).toMatchObject({
      discountAmount: 1,
      lineTotal: 2,
    });
  });

  it("rounds a share under half a cent down", () => {
    const line = { ...ALFAJOR, quantity: 3, discountAmount: 0, lineTotal: 1000 };

    expect(
      returnedReceiptLine(line, { returnedBefore: 0, quantity: 1, refundedAmount: 300 }),
    ).toMatchObject({
      discountAmount: 33,
      lineTotal: 300,
    });
  });
});
