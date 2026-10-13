import { describe, expect, it } from "vitest";
import { deferredSaleDocumentBlock, facturaCFiscalBlock } from "../../fiscal/index.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { type ReceiptSource, receiptContent } from "./receipt-content.js";
import { authorizedFacturaC } from "./test-support/authorized-factura-c.js";

const ISSUER_IDENTITY = {
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
};
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
  manualAdjustment: null,
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
  manualAdjustment: null,
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
    saleDiscount: null,
    lines: [YERBA, QUESO],
    payments: [{ method: "CASH", amount: 11250, tendered: 12000 }],
    fiscal: { kind: "none" },
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
        chargedUnitPrice: 2500,
        manualAdjustment: null,
        promotion: { kind: "PERCENT_OFF", percent: 10 },
        discountAmount: 750,
        lineTotal: 6750,
      },
      {
        productName: "Queso cremoso",
        saleUnit: "KG",
        quantity: 0.5,
        listUnitPrice: 9000,
        chargedUnitPrice: 9000,
        manualAdjustment: null,
        promotion: null,
        discountAmount: 0,
        lineTotal: 4500,
      },
    ]);
  });

  describe("a line with a manual adjustment", () => {
    const adjusted = (manualAdjustment: ReceiptSource["lines"][number]["manualAdjustment"]) =>
      receiptContent(
        source({ lines: [{ ...YERBA, promotions: [], promotionId: null, manualAdjustment }] }),
      ).lines[0];

    it("charges the overridden unit price, whatever the list price is", () => {
      expect(adjusted({ kind: "PRICE", unitPrice: 2000 })).toMatchObject({
        listUnitPrice: 2500,
        chargedUnitPrice: 2000,
        manualAdjustment: { kind: "PRICE", unitPrice: 2000 },
      });
    });

    it("charges the list unit price when the adjustment is a percent discount", () => {
      expect(adjusted({ kind: "PERCENT", percent: 10 })).toMatchObject({
        listUnitPrice: 2500,
        chargedUnitPrice: 2500,
        manualAdjustment: { kind: "PERCENT", percent: 10 },
      });
    });

    it("charges the list unit price when the adjustment is an amount discount", () => {
      expect(adjusted({ kind: "AMOUNT", amount: 300 })).toMatchObject({
        listUnitPrice: 2500,
        chargedUnitPrice: 2500,
        manualAdjustment: { kind: "AMOUNT", amount: 300 },
      });
    });

    it("charges a price of zero as zero", () => {
      expect(adjusted({ kind: "PRICE", unitPrice: 0 })?.chargedUnitPrice).toBe(0);
    });
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

  describe("a discount on the sale's total", () => {
    const discounted = (saleDiscount: ReceiptSource["saleDiscount"], total: number) =>
      receiptContent(source({ saleDiscount, total })).totals;

    it("shows a percent discount with its percent and the amount it takes off the subtotal", () => {
      const totals = discounted({ kind: "PERCENT", percent: 5 }, 10688);

      expect(totals).toMatchObject({
        subtotal: 11250,
        saleDiscount: { kind: "PERCENT", percent: 5, amount: 563 },
        total: 10688,
      });
    });

    it("shows a fixed amount discount with the amount it takes off", () => {
      expect(discounted({ kind: "AMOUNT", amount: 1250 }, 10000)).toMatchObject({
        subtotal: 11250,
        saleDiscount: { kind: "AMOUNT", amount: 1250 },
        total: 10000,
      });
    });

    it("shows no discount when the sale has none", () => {
      expect(discounted(null, 11250).saleDiscount).toBeNull();
    });
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

  it("lists a Mercado Pago QR payment by its method and gives no change for it", () => {
    const { totals } = receiptContent(
      source({ payments: [{ method: "QR", amount: 11250, tendered: null }] }),
    );

    expect(totals.payments).toEqual([{ method: "QR", amount: 11250 }]);
    expect(totals.change).toBe(0);
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

  it("lists a cash payment by the cash handed over, so it adds up with the change", () => {
    const { totals } = receiptContent(
      source({
        total: 2_140_000,
        payments: [{ method: "CASH", amount: 2_140_000, tendered: 2_500_000 }],
      }),
    );

    expect(totals.payments).toEqual([{ method: "CASH", amount: 2_500_000 }]);
    expect(totals.change).toBe(360_000);
  });

  it("lists a cash payment with no tendered amount recorded by the amount it paid", () => {
    expect(
      receiptContent(source({ payments: [{ method: "CASH", amount: 11250, tendered: null }] }))
        .totals.payments,
    ).toEqual([{ method: "CASH", amount: 11250 }]);
  });

  it("lists a non-cash payment by the amount it paid, whatever it records as tendered", () => {
    expect(
      receiptContent(source({ payments: [{ method: "TRANSFER", amount: 100, tendered: 900 }] }))
        .totals.payments,
    ).toEqual([{ method: "TRANSFER", amount: 100 }]);
  });

  describe("the fiscal block", () => {
    const AUTHORIZED = authorizedFacturaC(11250, ISSUER_IDENTITY);

    it("is the fiscal block of the authorized factura C of the sale", () => {
      const content = receiptContent(
        source({ fiscal: { kind: "authorized", authorized: AUTHORIZED } }),
      );

      expect(content.fiscal).toEqual(facturaCFiscalBlock(AUTHORIZED));
    });

    it("is the non-fiscal document block of the deferred sale of the sale", () => {
      const deferred = { id: "0198-abc", shortCode: "7KQ4M2P9" };

      const content = receiptContent(source({ fiscal: { kind: "deferred", deferred } }));

      expect(content.fiscal).toEqual(deferredSaleDocumentBlock(deferred));
    });

    it.each([
      ["has no fiscal document", { kind: "none" }],
      ["awaits the tax authority's answer", { kind: "awaiting" }],
    ] as const)("is absent when the sale %s", (_name, fiscal) => {
      expect(receiptContent(source({ fiscal })).fiscal).toBeNull();
    });
  });
});
