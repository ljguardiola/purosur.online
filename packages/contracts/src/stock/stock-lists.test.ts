import { describe, expect, it } from "vitest";
import {
  stockBalanceListSchema,
  stockBalanceSchema,
  stockCountListSchema,
  stockMovementListSchema,
  stockMovementReasonListSchema,
  stockProductListSchema,
} from "./stock-lists.js";

const at = "2026-09-15T21:32:00.000Z";

const balance = {
  id: "product-1",
  name: "Almendras peladas",
  categoryId: "category-1",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  balance: 12_150,
};

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
  it("accepts products with their balance, a negative one included", () => {
    const list = { products: [balance, { ...balance, id: "product-2", balance: -4000 }] };

    expect(stockBalanceListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["balance", 1.5],
    ["balance", "12150"],
    ["saleUnit", "LITRE"],
    ["name", null],
  ])("refuses %s as %j", (field, value) => {
    expect(
      stockBalanceListSchema.safeParse({ products: [{ ...balance, [field]: value }] }).success,
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
  ])("refuses %s as %j", (field, value) => {
    expect(stockBalanceSchema.safeParse({ ...balance, [field]: value }).success).toBe(false);
  });
});

describe("stockCountListSchema", () => {
  it("accepts counts with what was expected, counted and the difference", () => {
    const list = { counts: [count, { ...count, id: "movement-3", superseded: true }] };

    expect(stockCountListSchema.safeParse(list).data).toEqual(list);
  });

  it.each([
    ["occurredAt", "yesterday"],
    ["delta", 0.5],
    ["superseded", "no"],
    ["counted", -1],
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
  };

  it("accepts the products a movement can be registered for, without their balance", () => {
    expect(stockProductListSchema.safeParse({ products: [product] }).data).toEqual({
      products: [product],
    });
    expect(
      stockProductListSchema.safeParse({ products: [{ ...product, balance: 12_150 }] }).data,
    ).toEqual({ products: [product] });
  });

  it.each([
    ["saleUnit", "LITRE"],
    ["name", null],
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
