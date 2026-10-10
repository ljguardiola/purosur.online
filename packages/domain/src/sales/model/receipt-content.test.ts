import { describe, expect, it } from "vitest";
import { type ReceiptSource, receiptContent } from "./receipt-content.js";

const OCCURRED_AT = new Date("2026-10-07T15:30:00.000Z");
const HEADER = {
  address: "Av. Siempreviva 742",
  whatsappNumber: "+54 9 11 5555-0100",
  instagramHandle: "@purosur",
};
const YERBA = {
  productName: "Yerba 1 kg",
  saleUnit: "UNIT" as const,
  quantity: 3,
  listUnitPrice: 2500,
  promotions: [
    { id: "other", benefit: { kind: "BUY_N_PAY_M" as const, buyQty: 3, payQty: 2 } },
    { id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } },
  ],
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const QUESO = {
  productName: "Queso cremoso",
  saleUnit: "KG" as const,
  quantity: 0.5,
  listUnitPrice: 9000,
  promotions: [],
  promotionId: null,
  discountAmount: 0,
  lineTotal: 4500,
};

function source(overrides: Partial<ReceiptSource> = {}): ReceiptSource {
  return {
    header: HEADER,
    occurredAt: OCCURRED_AT,
    servedByFirstName: "Marta",
    operationNumber: 482,
    total: 11250,
    lines: [YERBA, QUESO],
    payments: [{ method: "CASH", amount: 11250, tendered: 12000 }],
    ...overrides,
  };
}

describe("receiptContent", () => {
  it("takes the header from the branch settings", () => {
    expect(receiptContent(source()).header).toEqual(HEADER);
  });

  it("shows when the sale happened, who served it and its operation number", () => {
    expect(receiptContent(source()).operation).toEqual({
      occurredAt: OCCURRED_AT,
      servedByFirstName: "Marta",
      operationNumber: 482,
    });
  });

  it("shows each line with the benefit of the promotion it applied, or none", () => {
    expect(receiptContent(source()).lines).toEqual([
      {
        productName: "Yerba 1 kg",
        saleUnit: "UNIT",
        quantity: 3,
        listUnitPrice: 2500,
        promotion: { kind: "PERCENT_OFF", percent: 10 },
        discountAmount: 750,
        lineTotal: 6750,
      },
      {
        productName: "Queso cremoso",
        saleUnit: "KG",
        quantity: 0.5,
        listUnitPrice: 9000,
        promotion: null,
        discountAmount: 0,
        lineTotal: 4500,
      },
    ]);
  });

  it("shows no promotion when the applied one is not among the line's", () => {
    const [line] = receiptContent(source({ lines: [{ ...YERBA, promotionId: "gone" }] })).lines;

    expect(line?.promotion).toBeNull();
  });

  it("totals the lines for the subtotal and carries the sale's total", () => {
    const { totals } = receiptContent(source({ total: 11000 }));

    expect(totals.subtotal).toBe(11250);
    expect(totals.total).toBe(11000);
  });

  it("lists the payments by method and amount", () => {
    const { totals } = receiptContent(
      source({
        payments: [
          { method: "CASH", amount: 5000, tendered: 5000 },
          { method: "TRANSFER", amount: 6250, tendered: null },
        ],
      }),
    );

    expect(totals.payments).toEqual([
      { method: "CASH", amount: 5000 },
      { method: "TRANSFER", amount: 6250 },
    ]);
  });

  it("gives as change what was tendered in cash beyond the cash payments", () => {
    const { totals } = receiptContent(
      source({
        payments: [
          { method: "CASH", amount: 4000, tendered: 5000 },
          { method: "CASH", amount: 1250, tendered: 2000 },
          { method: "TRANSFER", amount: 6000, tendered: null },
        ],
      }),
    );

    expect(totals.change).toBe(1750);
  });

  it("ignores what a non-cash payment records as tendered", () => {
    expect(
      receiptContent(source({ payments: [{ method: "TRANSFER", amount: 100, tendered: 900 }] }))
        .totals.change,
    ).toBe(0);
  });

  it("gives no change when nothing was paid in cash", () => {
    expect(
      receiptContent(source({ payments: [{ method: "TRANSFER", amount: 11250, tendered: null }] }))
        .totals.change,
    ).toBe(0);
  });

  it("gives no change for a cash payment with no tendered amount recorded", () => {
    expect(
      receiptContent(source({ payments: [{ method: "CASH", amount: 11250, tendered: null }] }))
        .totals.change,
    ).toBe(0);
  });
});
