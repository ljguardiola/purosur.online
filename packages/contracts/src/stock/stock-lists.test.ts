import { DEFAULT_STOCK_PERIOD_DAYS, STOCK_PERIOD_DAYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  stockBalanceListSchema,
  stockBalanceSchema,
  stockCountListSchema,
  stockMovementListSchema,
  stockMovementReasonListSchema,
  stockPeriodDaysSchema,
  stockPeriodSchema,
  stockProductBalanceSchema,
  stockProductListSchema,
} from "./stock-lists.js";

const at = "2026-09-15T21:32:00.000Z";

const purchasedLot = {
  id: "lot-1",
  lotNumber: "L-77",
  expiresOn: "2027-03-01",
  technical: false,
  remaining: 12_150,
  valueCents: 60_750,
  unitCostCents: 5_000,
  origin: { kind: "purchase", purchasedOn: "2026-10-01", supplierName: "Distribuidora Sur" },
};

const technicalLot = {
  id: "lot-2",
  lotNumber: null,
  expiresOn: null,
  technical: true,
  remaining: -4_000,
  valueCents: null,
  unitCostCents: null,
  origin: { kind: "product_sales_without_lots" },
};

const summary = { productCount: 3, valueCents: 60_750, withoutCostCount: 2 };

const balance = {
  id: "product-1",
  name: "Almendras peladas",
  categoryId: "category-1",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  active: true,
  balance: 12_150,
  valueCents: 60_750,
  unitCostCents: 5_000,
  lotCount: 1,
  correction: null,
  lots: [purchasedLot],
};

const countableLot = { id: "lot-1", lotNumber: "L-77", expiresOn: "2027-03-01", expected: 12_150 };

const count = {
  id: "movement-1",
  productId: "product-1",
  productName: "Almendras peladas",
  categoryId: "category-1",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  occurredAt: at,
  expected: 12_400,
  counted: 12_150,
  delta: -250,
  superseded: false,
  lotCount: null,
};

const movement = {
  id: "movement-2",
  productId: "product-1",
  productName: "Miel pura de abeja 1 kg",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  kind: "loss",
  reason: "broken_or_spilled",
  delta: -1000,
  occurredAt: at,
  superseded: false,
};

describe("stockBalanceListSchema", () => {
  it("accepts products with their balance, valuation and lots, and the footer summary", () => {
    const list = {
      products: [
        balance,
        {
          ...balance,
          id: "product-2",
          balance: -4000,
          valueCents: null,
          unitCostCents: null,
          lotCount: 1,
          correction: "purchase_or_count",
          lots: [technicalLot],
        },
        { ...balance, id: "product-3", active: false, correction: "count" },
        {
          ...balance,
          id: "product-4",
          valueCents: null,
          unitCostCents: null,
          lotCount: 0,
          lots: [],
        },
      ],
      summary,
    };

    expect(stockBalanceListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["balance", 1.5],
    ["balance", "12150"],
    ["saleUnit", "LITRE"],
    ["name", null],
    ["active", undefined],
    ["active", "false"],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockBalanceListSchema.safeParse({ products: [{ ...balance, [field]: value }], summary })
        .success,
    ).toBe(false);
  });

  it("refuses a list without its summary", () => {
    expect(stockBalanceListSchema.safeParse({ products: [balance] }).success).toBe(false);
  });

  it.each([
    ["productCount", 1.5],
    ["productCount", undefined],
    ["valueCents", 1.5],
    ["valueCents", null],
    ["withoutCostCount", "2"],
  ])("refuses a summary with %s as %j", (field, value) => {
    expect(
      stockBalanceListSchema.safeParse({
        products: [balance],
        summary: { ...summary, [field]: value },
      }).success,
    ).toBe(false);
  });
});

describe("stockBalanceSchema", () => {
  it("accepts a product with the balance it holds", () => {
    expect(stockBalanceSchema.safeParse(balance).data).toEqual(balance);
  });

  it.each([
    ["balance", 0.5],
    ["balance", undefined],
    ["active", undefined],
    ["valueCents", 1.5],
    ["valueCents", undefined],
    ["unitCostCents", 1.5],
    ["unitCostCents", undefined],
    ["lotCount", 1.5],
    ["lotCount", undefined],
    ["correction", "recount"],
    ["correction", undefined],
    ["lots", undefined],
    ["lots", [{ ...purchasedLot, remaining: 0.5 }]],
  ])("refuses %s as %j", (field, value) => {
    expect(stockBalanceSchema.safeParse({ ...balance, [field]: value }).success).toBe(false);
  });

  it.each(["count", "purchase_or_count", null])("accepts %j as the correction", (correction) => {
    expect(stockBalanceSchema.safeParse({ ...balance, correction }).data).toEqual({
      ...balance,
      correction,
    });
  });

  it("accepts a technical lot without a value or a unit cost", () => {
    expect(stockBalanceSchema.safeParse({ ...balance, lots: [technicalLot] }).data).toEqual({
      ...balance,
      lots: [technicalLot],
    });
  });

  it("accepts a lot of the initial count with its cost still incomplete and one with a typed cost", () => {
    const initialCountLot = {
      id: "lot-3",
      lotNumber: null,
      expiresOn: "2027-01-31",
      technical: false,
      remaining: 6_000,
      valueCents: null,
      unitCostCents: null,
      origin: { kind: "initial_count" },
    };
    const typedLot = { ...initialCountLot, id: "lot-4", valueCents: 7_404, unitCostCents: 1_234 };

    expect(
      stockBalanceSchema.safeParse({ ...balance, lots: [initialCountLot, typedLot] }).data,
    ).toEqual({ ...balance, lots: [initialCountLot, typedLot] });
  });

  it.each([
    ["remaining", 0.5],
    ["valueCents", 1.5],
    ["valueCents", undefined],
    ["unitCostCents", 1.5],
    ["unitCostCents", undefined],
    ["expiresOn", "2027-02-30"],
    ["technical", "no"],
    ["id", null],
    ["origin", { kind: "gift" }],
    ["origin", { kind: "purchase", purchasedOn: "yesterday", supplierName: "Distribuidora Sur" }],
    ["origin", { kind: "purchase", purchasedOn: "2026-10-01" }],
    ["origin", undefined],
  ])("refuses a lot with %s as %j", (field, value) => {
    expect(
      stockBalanceSchema.safeParse({ ...balance, lots: [{ ...purchasedLot, [field]: value }] })
        .success,
    ).toBe(false);
  });
});

describe("stockProductBalanceSchema", () => {
  const { valueCents, unitCostCents, lotCount, correction, lots, ...product } = balance;
  const productWithBalance = { ...product, lots: [countableLot] };

  it("accepts a product with the balance it holds and the lots that can be counted", () => {
    expect(stockProductBalanceSchema.safeParse(productWithBalance).data).toEqual(
      productWithBalance,
    );
  });

  it("accepts a lot with no number or expiry, and a product with no lot", () => {
    const bare = {
      ...productWithBalance,
      lots: [{ ...countableLot, lotNumber: null, expiresOn: null }],
    };

    expect(stockProductBalanceSchema.safeParse(bare).data).toEqual(bare);
    expect(stockProductBalanceSchema.safeParse({ ...productWithBalance, lots: [] }).success).toBe(
      true,
    );
  });

  it.each([
    ["balance", 0.5],
    ["balance", undefined],
    ["active", undefined],
    ["lots", undefined],
    ["lots", [{ ...countableLot, expected: 0.5 }]],
    ["lots", [{ ...countableLot, expected: undefined }]],
    ["lots", [{ ...countableLot, expiresOn: "2027-02-30" }]],
    ["lots", [{ ...countableLot, id: undefined }]],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockProductBalanceSchema.safeParse({ ...productWithBalance, [field]: value }).success,
    ).toBe(false);
  });
});

describe("stockCountListSchema", () => {
  it("accepts counts with what was expected, counted and the difference", () => {
    const list = {
      counts: [count, { ...count, id: "movement-3", superseded: true, lotCount: 3 }],
    };

    expect(stockCountListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["occurredAt", "yesterday"],
    ["delta", 0.5],
    ["superseded", "no"],
    ["counted", -1],
    ["lotCount", undefined],
    ["lotCount", 1.5],
  ])("refuses %s as %j", (field, value) => {
    expect(stockCountListSchema.safeParse({ counts: [{ ...count, [field]: value }] }).success).toBe(
      false,
    );
  });
});

describe("stockMovementListSchema", () => {
  it("accepts losses and adjustments with their reason", () => {
    const list = {
      movements: [
        movement,
        { ...movement, id: "movement-3", kind: "adjustment", reason: "supplier_return" },
      ],
    };

    expect(stockMovementListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["kind", "count"],
    ["reason", "whatever"],
    ["delta", "1"],
    ["superseded", "no"],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockMovementListSchema.safeParse({ movements: [{ ...movement, [field]: value }] }).success,
    ).toBe(false);
  });
});

describe("stockProductListSchema", () => {
  const product = {
    id: "product-1",
    name: "Almendras peladas",
    categoryId: "category-1",
    categoryName: "Frutos secos",
    saleUnit: "KG",
    active: true,
  };

  it("accepts the products a movement can be registered for, without their balance", () => {
    expect(stockProductListSchema.safeParse({ products: [product] }).data).toEqual({
      products: [product],
    });
    expect(
      stockProductListSchema.safeParse({ products: [{ ...product, active: false }] }).data,
    ).toEqual({ products: [{ ...product, active: false }] });
    expect(
      stockProductListSchema.safeParse({ products: [{ ...product, balance: 12_150 }] }).data,
    ).toEqual({ products: [product] });
  });

  it.each([
    ["saleUnit", "LITRE"],
    ["name", null],
    ["active", undefined],
    ["active", "true"],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockProductListSchema.safeParse({ products: [{ ...product, [field]: value }] }).success,
    ).toBe(false);
  });
});

describe("stockMovementReasonListSchema", () => {
  const theft = { kind: "loss", reason: "theft", directions: ["subtract"] };

  it("accepts each kind's reasons with the directions each allows", () => {
    const list = {
      reasons: [
        theft,
        { kind: "adjustment", reason: "purchase_correction", directions: ["add", "subtract"] },
      ],
    };

    expect(stockMovementReasonListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["kind", "count"],
    ["reason", "supplier_return"],
    ["directions", []],
    ["directions", ["up"]],
    ["directions", undefined],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockMovementReasonListSchema.safeParse({ reasons: [{ ...theft, [field]: value }] }).success,
    ).toBe(false);
  });
});

describe("stockPeriodDaysSchema", () => {
  it("lists the offered stock periods", () => {
    expect([...stockPeriodDaysSchema.values]).toEqual(STOCK_PERIOD_DAYS);
  });
});

describe("stockPeriodSchema", () => {
  it.each(STOCK_PERIOD_DAYS)("reads an offered period of %i days as written", (days) => {
    expect(stockPeriodSchema.parse(String(days))).toBe(String(days));
  });

  it.each([undefined, "", "45", "030", "30.0", " 30", "7days", 30])(
    "reads %j as the default period",
    (value) => {
      expect(stockPeriodSchema.parse(value)).toBe(String(DEFAULT_STOCK_PERIOD_DAYS));
    },
  );
});
