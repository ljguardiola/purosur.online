import { describe, expect, it } from "vitest";
import { readStockBalances } from "./read-stock-balances.js";
import type { LotInStock, StockLevel } from "./stock-reader.js";
import { FakeStockListReader } from "./test-support/fake-stock-list-reader.js";

function level(id: string, overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    id,
    name: `Producto ${id}`,
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "KG",
    active: true,
    balance: 0,
    lots: [],
    ...overrides,
  };
}

function purchasedLot(id: string, overrides: Partial<LotInStock> = {}): LotInStock {
  return {
    id,
    lotNumber: null,
    expiresOn: null,
    purchase: { purchasedOn: "2026-10-01", supplierName: "Distribuidora Sur" },
    remaining: 4_000,
    costIncomplete: false,
    cost: { totalCents: 5_000, quantity: 1_000 },
    ...overrides,
  };
}

function technicalLot(id: string, remaining: number): LotInStock {
  return {
    id,
    lotNumber: null,
    expiresOn: null,
    purchase: null,
    remaining,
    costIncomplete: true,
    cost: null,
  };
}

async function read(levels: StockLevel[]) {
  const stockList = new FakeStockListReader(levels);
  return readStockBalances({ stockList }, { locationId: "location-1" });
}

describe("readStockBalances", () => {
  it("reads the levels of the location", async () => {
    const stockList = new FakeStockListReader([]);

    await readStockBalances({ stockList }, { locationId: "location-1" });

    expect(stockList.reads).toEqual(["location-1"]);
  });

  it("answers an empty list with an empty footer for no products", async () => {
    expect(await read([])).toEqual({
      products: [],
      summary: { productCount: 0, valueCents: 0, withoutCostCount: 0 },
    });
  });

  it("keeps the product's identity and balance", async () => {
    const { products } = await read([
      level("p1", { balance: 4_000, active: false, lots: [purchasedLot("l1")] }),
    ]);

    expect(products[0]).toMatchObject({
      id: "p1",
      name: "Producto p1",
      categoryId: "category-1",
      categoryName: "Almacén",
      saleUnit: "KG",
      active: false,
      balance: 4_000,
    });
  });

  it("values a product as the sum of its lots, with its unit cost and lot count", async () => {
    const { products } = await read([
      level("p1", {
        balance: 6_000,
        lots: [
          purchasedLot("l1", { remaining: 4_000 }),
          purchasedLot("l2", {
            remaining: 2_000,
            cost: { totalCents: 6_000, quantity: 1_000 },
          }),
        ],
      }),
    ]);

    expect(products[0]).toMatchObject({
      valueCents: 32_000,
      unitCostCents: 5_333,
      lotCount: 2,
      correction: null,
    });
  });

  it("gives a lot its value, its unit cost and its purchase as origin", async () => {
    const { products } = await read([
      level("p1", {
        balance: 4_000,
        lots: [
          purchasedLot("l1", { lotNumber: "L-77", expiresOn: "2027-03-01", remaining: 4_000 }),
        ],
      }),
    ]);

    expect(products[0]?.lots).toEqual([
      {
        id: "l1",
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
        technical: false,
        remaining: 4_000,
        valueCents: 20_000,
        unitCostCents: 5_000,
        origin: { kind: "purchase", purchasedOn: "2026-10-01", supplierName: "Distribuidora Sur" },
      },
    ]);
  });

  it("gives a technical lot no value and the product's sales without lots as origin", async () => {
    const { products } = await read([
      level("p1", { balance: -2_000, lots: [technicalLot("t", -2_000)] }),
    ]);

    expect(products[0]?.lots).toEqual([
      {
        id: "t",
        lotNumber: null,
        expiresOn: null,
        technical: true,
        remaining: -2_000,
        valueCents: null,
        unitCostCents: null,
        origin: { kind: "product_sales_without_lots" },
      },
    ]);
  });

  it("lists the lots in the order they are consumed", async () => {
    const { products } = await read([
      level("p1", {
        balance: 11_000,
        lots: [
          technicalLot("technical", -1_000),
          purchasedLot("no-expiry", { expiresOn: null }),
          purchasedLot("late", { expiresOn: "2027-06-01" }),
          purchasedLot("early", { expiresOn: "2027-01-01" }),
          purchasedLot("early-older-purchase", {
            expiresOn: "2027-01-01",
            purchase: { purchasedOn: "2026-09-01", supplierName: "Distribuidora Sur" },
          }),
        ],
      }),
    ]);

    expect(products[0]?.lots.map((lot) => lot.id)).toEqual([
      "early-older-purchase",
      "early",
      "late",
      "no-expiry",
      "technical",
    ]);
  });

  it("gives a product with a technical lot no value or unit cost, and asks for a purchase or a count", async () => {
    const { products } = await read([
      level("p1", { balance: 2_000, lots: [technicalLot("t", 2_000)] }),
    ]);

    expect(products[0]).toMatchObject({
      valueCents: null,
      unitCostCents: null,
      lotCount: 1,
      correction: "purchase_or_count",
    });
  });

  it("gives a product with a technical lot beside a purchased one no value", async () => {
    const { products } = await read([
      level("p1", { balance: 2_000, lots: [purchasedLot("l1"), technicalLot("t", -2_000)] }),
    ]);

    expect(products[0]).toMatchObject({ valueCents: null, unitCostCents: null, correction: null });
  });

  it("gives a product without lots no value and asks for a purchase or a count", async () => {
    const { products } = await read([level("p1", { balance: 0 })]);

    expect(products[0]).toMatchObject({
      valueCents: null,
      unitCostCents: null,
      lotCount: 0,
      correction: "purchase_or_count",
      lots: [],
    });
  });

  it("asks for a count when the balance is negative with a purchased lot in stock", async () => {
    const { products } = await read([
      level("p1", { balance: -1_000, lots: [purchasedLot("l1", { remaining: -1_000 })] }),
    ]);

    expect(products[0]).toMatchObject({
      valueCents: -5_000,
      unitCostCents: 5_000,
      correction: "count",
    });
  });

  it("sums the footer over the listed products", async () => {
    const { summary } = await read([
      level("p1", { balance: 4_000, lots: [purchasedLot("l1")] }),
      level("p2", { balance: 2_000, lots: [technicalLot("t", 2_000)] }),
      level("p3", { balance: 0 }),
      level("p4", { balance: 1_000, lots: [purchasedLot("l4", { remaining: 1_000 })] }),
    ]);

    expect(summary).toEqual({ productCount: 4, valueCents: 25_000, withoutCostCount: 2 });
  });
});
