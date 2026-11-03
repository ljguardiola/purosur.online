import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { readStockBalances } from "./read-stock-balances.js";
import type { LotInStock, StockLevel } from "./stock-reader.js";
import {
  FakeLotNameReader,
  initialCountLotFacts,
  purchaseLotFacts,
} from "./test-support/fake-lot-name-reader.js";
import { FakeStockListReader } from "./test-support/fake-stock-list-reader.js";
import { lotFactsOfLevels } from "./test-support/lot-facts-of-levels.js";

function level(id: string, overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    id,
    name: `Producto ${id}`,
    brandName: null,
    netContent: null,
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
    code: 1,
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

function initialCountLot(id: string, overrides: Partial<LotInStock> = {}): LotInStock {
  return {
    id,
    code: 1,
    expiresOn: "2027-03-01",
    purchase: null,
    initialCount: true,
    assemblyBatch: null,
    remaining: 6_000,
    costIncomplete: true,
    cost: null,
    ...overrides,
  };
}

function technicalLot(id: string, remaining: number): LotInStock {
  return {
    id,
    code: 1,
    expiresOn: null,
    purchase: null,
    initialCount: false,
    assemblyBatch: null,
    remaining,
    costIncomplete: true,
    cost: null,
  };
}

async function read(levels: StockLevel[], facts = lotFactsOfLevels(levels, "location-1")) {
  const stockList = new FakeStockListReader(levels);
  const lotNames = new FakeLotNameReader(facts);
  return readStockBalances(
    { stockList, lotNames, zoneRules: new FakeZoneRulesSource() },
    { locationId: "location-1" },
  );
}

describe("readStockBalances", () => {
  it("reads the levels of the location", async () => {
    const stockList = new FakeStockListReader([]);

    await readStockBalances(
      { stockList, lotNames: new FakeLotNameReader([]), zoneRules: new FakeZoneRulesSource() },
      { locationId: "location-1" },
    );

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
    expect(products[0]).not.toHaveProperty("hasMoved");
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
        lots: [purchasedLot("l1", { code: 77, expiresOn: "2027-03-01", remaining: 4_000 })],
      }),
    ]);

    expect(products[0]?.lots).toEqual([
      {
        id: "l1",
        name: { origin: "purchase", day: "2026-10-01", number: null },
        code: 77,
        expiresOn: "2027-03-01",
        technical: false,
        remaining: 4_000,
        valueCents: 20_000,
        unitCostCents: 5_000,
        origin: { kind: "purchase", purchasedOn: "2026-10-01", supplierName: "Distribuidora Sur" },
      },
    ]);
  });

  it("gives the lot of an assembled batch its own origin, not a technical lot's, ordered by its expiry with the rest", async () => {
    const assembledAt = new Date("2026-05-04T13:00:00.000Z");
    const batchLot = {
      ...technicalLot("l2", 14_000),
      expiresOn: "2027-01-15",
      costIncomplete: false,
      cost: { totalCents: 50_200, quantity: 14_000 },
      assemblyBatch: { assembledAt },
    };
    const { products } = await read([
      level("p1", {
        balance: 18_000,
        lots: [purchasedLot("l1", { expiresOn: "2027-06-01" }), batchLot],
      }),
    ]);

    expect(products[0]?.lots.map((lot) => lot.id)).toEqual(["l2", "l1"]);
    expect(products[0]?.lots[0]).toEqual({
      id: "l2",
      name: { origin: "assembly_batch", day: "2026-05-04", number: null },
      code: 1,
      expiresOn: "2027-01-15",
      technical: false,
      remaining: 14_000,
      valueCents: 50_200,
      unitCostCents: 3_586,
      origin: { kind: "assembly_batch", assembledAt },
    });
  });

  it("gives a lot of the initial count its own origin, not a technical lot, with no value while its cost is incomplete", async () => {
    const { products } = await read([
      level("p1", { balance: 6_000, lots: [initialCountLot("l1")] }),
    ]);

    expect(products[0]?.lots).toEqual([
      {
        id: "l1",
        name: { origin: "initial_count", day: "2026-10-27", number: null },
        code: 1,
        expiresOn: "2027-03-01",
        technical: false,
        remaining: 6_000,
        valueCents: null,
        unitCostCents: null,
        origin: { kind: "initial_count" },
      },
    ]);
    expect(products[0]).toMatchObject({ valueCents: null, unitCostCents: null, correction: null });
  });

  it("values a lot of the initial count with its typed cost exactly as it values a purchase's", async () => {
    const typed = { totalCents: 1_234, quantity: 1_000 };
    const { products } = await read([
      level("p1", {
        balance: 6_000,
        lots: [
          initialCountLot("l1", { cost: typed, costIncomplete: false }),
          purchasedLot("l2", { cost: typed, remaining: 6_000 }),
        ],
      }),
    ]);

    const [initial, purchase] = products[0]?.lots ?? [];
    expect(initial).toMatchObject({ valueCents: 7_404, unitCostCents: 1_234 });
    expect(purchase).toMatchObject({ valueCents: 7_404, unitCostCents: 1_234 });
  });

  it("gives a technical lot no value and the product's sales without lots as origin", async () => {
    const { products } = await read([
      level("p1", { balance: -2_000, lots: [technicalLot("t", -2_000)] }),
    ]);

    expect(products[0]?.lots).toEqual([
      {
        id: "t",
        name: { origin: "technical", day: "2026-10-27", number: null },
        code: 1,
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

  it("sums the footer over the listed products that had a movement", async () => {
    const { products, summary } = await read([
      level("p1", { balance: 4_000, lots: [purchasedLot("l1")] }),
      level("p2", { balance: 2_000, lots: [technicalLot("t", 2_000)] }),
      level("p3", { balance: 0 }),
      level("p4", { balance: 1_000, lots: [purchasedLot("l4", { remaining: 1_000 })] }),
      level("p5", { hasMoved: false }),
    ]);

    expect(products.map((product) => product.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(summary).toEqual({ productCount: 4, valueCents: 25_000, withoutCostCount: 2 });
  });

  describe("naming the lots", () => {
    it("names a purchased lot by its purchase's day", async () => {
      const { products } = await read([
        level("p1", {
          balance: 4_000,
          lots: [
            purchasedLot("l1", { purchase: { purchasedOn: "2026-11-03", supplierName: "A" } }),
          ],
        }),
      ]);

      expect(products[0]?.lots[0]?.name).toEqual({
        origin: "purchase",
        day: "2026-11-03",
        number: null,
      });
    });

    it("numbers lots that share their origin and day in the order they took their name, whatever the order they are listed in", async () => {
      const levels = [
        level("p1", {
          balance: 8_000,
          lots: [purchasedLot("first"), purchasedLot("second")],
        }),
      ];

      const { products } = await read(levels, [
        purchaseLotFacts("first", "p1", 8, "2026-10-01"),
        purchaseLotFacts("second", "p1", 9, "2026-10-01"),
      ]);

      expect(products[0]?.lots.map((lot) => [lot.id, lot.name.number])).toEqual([
        ["first", 1],
        ["second", 2],
      ]);
    });

    it("counts a sibling lot that is not in stock when it numbers a lot", async () => {
      const levels = [level("p1", { balance: 4_000, lots: [purchasedLot("kept")] })];

      const { products } = await read(levels, [
        purchaseLotFacts("gone", "p1", 1, "2026-10-01"),
        purchaseLotFacts("kept", "p1", 2, "2026-10-01"),
      ]);

      expect(products[0]?.lots[0]?.name.number).toBe(2);
    });

    it("does not number a lot after a lot of another product, branch or origin", async () => {
      const levels = [level("p1", { balance: 4_000, lots: [purchasedLot("mine")] })];

      const { products } = await read(levels, [
        purchaseLotFacts("mine", "p1", 2, "2026-10-01"),
        purchaseLotFacts("other-product", "p2", 1, "2026-10-01"),
        purchaseLotFacts("other-branch", "p1", 1, "2026-10-01", "location-2"),
        initialCountLotFacts("counted", "p1", 3, new Date("2026-10-01T15:00:00.000Z")),
      ]);

      expect(products[0]?.lots[0]?.name.number).toBeNull();
    });

    it("names a lot of the initial count by the Argentine day it was counted under the zone rules it is given", async () => {
      const levels = [level("p1", { balance: 6_000, lots: [initialCountLot("l1")] })];
      const facts = [initialCountLotFacts("l1", "p1", 1, new Date("2026-10-28T02:30:00.000Z"))];
      const stockList = new FakeStockListReader(levels);

      const underArgentina = await readStockBalances(
        {
          stockList,
          lotNames: new FakeLotNameReader(facts),
          zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(-180)),
        },
        { locationId: "location-1" },
      );
      const underUtc = await readStockBalances(
        {
          stockList,
          lotNames: new FakeLotNameReader(facts),
          zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
        },
        { locationId: "location-1" },
      );

      expect(underArgentina.products[0]?.lots[0]?.name.day).toBe("2026-10-27");
      expect(underUtc.products[0]?.lots[0]?.name.day).toBe("2026-10-28");
    });

    it("asks for the facts of the branch's lots of the products that have lots", async () => {
      const levels = [
        level("p1", { balance: 4_000, lots: [purchasedLot("l1")] }),
        level("p2", { balance: 0 }),
        level("p3", { balance: 4_000, lots: [purchasedLot("l3")] }),
      ];
      const lotNames = new FakeLotNameReader(lotFactsOfLevels(levels, "location-1"));

      await readStockBalances(
        {
          stockList: new FakeStockListReader(levels),
          lotNames,
          zoneRules: new FakeZoneRulesSource(),
        },
        { locationId: "location-1" },
      );

      expect(lotNames.reads).toEqual([{ locationId: "location-1", productIds: ["p1", "p3"] }]);
    });
  });
});
