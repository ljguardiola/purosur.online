import { describe, expect, it } from "vitest";
import { readCurrentStockReport } from "./read-current-stock-report.js";
import type { LotInStock, StockLevel } from "./stock-reader.js";
import { FakeCurrentStockReader } from "./test-support/fake-current-stock-reader.js";

function level(id: string, overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    id,
    name: `Producto ${id}`,
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "KG",
    active: true,
    hasMoved: true,
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
    initialCount: false,
    assemblyBatch: null,
    remaining: 4_000,
    costIncomplete: false,
    cost: { totalCents: 5_000, quantity: 1_000 },
    ...overrides,
  };
}

function lotWithoutCost(id: string, remaining: number): LotInStock {
  return {
    id,
    lotNumber: null,
    expiresOn: null,
    purchase: null,
    initialCount: true,
    assemblyBatch: null,
    remaining,
    costIncomplete: true,
    cost: null,
  };
}

async function read(levels: StockLevel[], categoryId?: string) {
  const currentStock = new FakeCurrentStockReader(levels);
  return readCurrentStockReport(
    { currentStock },
    { locationId: "location-1", ...(categoryId === undefined ? {} : { categoryId }) },
  );
}

describe("readCurrentStockReport", () => {
  it("reads the levels of the location", async () => {
    const currentStock = new FakeCurrentStockReader([]);

    await readCurrentStockReport({ currentStock }, { locationId: "location-1" });

    expect(currentStock.reads).toEqual(["location-1"]);
  });

  it("answers an empty report when no product holds stock", async () => {
    expect(await read([])).toEqual({
      products: [],
      categories: [],
      summary: { valueCents: 0, productCount: 0, negativeBalanceCount: 0, withoutCostCount: 0 },
    });
  });

  it("leaves out a product with no balance and no lot in stock", async () => {
    const { products } = await read([
      level("empty"),
      level("held", { balance: 4_000, lots: [purchasedLot("l1")] }),
    ]);

    expect(products.map(({ id }) => id)).toEqual(["held"]);
  });

  it("lists a product with a zero balance that still has a lot in stock", async () => {
    const { products } = await read([
      level("p1", {
        balance: 0,
        lots: [purchasedLot("l1", { remaining: 2_000 }), purchasedLot("l2", { remaining: -2_000 })],
      }),
    ]);

    expect(products.map(({ id }) => id)).toEqual(["p1"]);
  });

  it("lists the product's identity, balance and lots only", async () => {
    const { products } = await read([
      level("p1", {
        balance: 4_000,
        lots: [purchasedLot("l1", { lotNumber: "L-77", expiresOn: "2027-03-01" })],
      }),
    ]);

    expect(products).toEqual([
      {
        id: "p1",
        name: "Producto p1",
        categoryId: "category-1",
        categoryName: "Almacén",
        saleUnit: "KG",
        balance: 4_000,
        valueCents: 20_000,
        lots: [
          {
            id: "l1",
            lotNumber: "L-77",
            expiresOn: "2027-03-01",
            technical: false,
            remaining: 4_000,
            unitCostCents: 5_000,
            valueCents: 20_000,
          },
        ],
      },
    ]);
  });

  it("values each lot at its own cost and the product as the sum of its lots", async () => {
    const { products } = await read([
      level("p1", {
        balance: 6_000,
        lots: [
          purchasedLot("l1", { remaining: 4_000 }),
          purchasedLot("l2", { remaining: 2_000, cost: { totalCents: 6_000, quantity: 1_000 } }),
        ],
      }),
    ]);

    expect(products[0]?.lots.map(({ valueCents }) => valueCents)).toEqual([20_000, 12_000]);
    expect(products[0]?.valueCents).toBe(32_000);
  });

  it("gives no value to a lot without a known cost nor to its product", async () => {
    const { products, summary } = await read([
      level("p1", {
        balance: 7_000,
        lots: [purchasedLot("l1", { remaining: 4_000 }), lotWithoutCost("l2", 3_000)],
      }),
    ]);

    expect(products[0]?.lots.map(({ valueCents }) => valueCents)).toEqual([20_000, null]);
    expect(products[0]?.lots[1]?.unitCostCents).toBeNull();
    expect(products[0]?.valueCents).toBeNull();
    expect(summary.withoutCostCount).toBe(1);
  });

  it("marks a lot that belongs to no purchase, count or batch as technical", async () => {
    const { products } = await read([
      level("p1", {
        balance: -1_000,
        lots: [
          {
            ...lotWithoutCost("l1", -1_000),
            initialCount: false,
          },
        ],
      }),
    ]);

    expect(products[0]?.lots[0]?.technical).toBe(true);
  });

  it("summarizes the report", async () => {
    const { summary } = await read([
      level("p1", { balance: 4_000, lots: [purchasedLot("l1")] }),
      level("p2", { balance: -1_000, lots: [purchasedLot("l2", { remaining: -1_000 })] }),
      level("p3", { balance: 2_000, lots: [lotWithoutCost("l3", 2_000)] }),
    ]);

    expect(summary).toEqual({
      valueCents: 15_000,
      productCount: 3,
      negativeBalanceCount: 1,
      withoutCostCount: 1,
    });
  });

  it("offers each category of the products holding stock once", async () => {
    const { categories } = await read([
      level("p1", { balance: 1_000, categoryId: "c2", categoryName: "Limpieza" }),
      level("p2", { balance: 1_000, categoryId: "c1", categoryName: "Almacén" }),
      level("p3", { balance: 1_000, categoryId: "c2", categoryName: "Limpieza" }),
      level("p4", { balance: 0, categoryId: "c3", categoryName: "Bebidas" }),
    ]);

    expect(categories).toHaveLength(2);
    expect(categories).toEqual(
      expect.arrayContaining([
        { id: "c1", name: "Almacén" },
        { id: "c2", name: "Limpieza" },
      ]),
    );
  });

  describe("filtered by category", () => {
    const levels = [
      level("p1", { balance: 4_000, categoryId: "c1", lots: [purchasedLot("l1")] }),
      level("p2", {
        balance: 2_000,
        categoryId: "c2",
        categoryName: "Limpieza",
        lots: [purchasedLot("l2", { remaining: 2_000 })],
      }),
    ];

    it("lists and summarizes only the products of that category", async () => {
      const { products, summary } = await read(levels, "c2");

      expect(products.map(({ id }) => id)).toEqual(["p2"]);
      expect(summary).toMatchObject({ productCount: 1, valueCents: 10_000 });
    });

    it("keeps offering every category", async () => {
      const { categories } = await read(levels, "c2");

      expect(categories.map(({ id }) => id).sort()).toEqual(["c1", "c2"]);
    });

    it("answers an empty list for a category holding no stock", async () => {
      expect((await read(levels, "c9")).products).toEqual([]);
    });
  });
});
