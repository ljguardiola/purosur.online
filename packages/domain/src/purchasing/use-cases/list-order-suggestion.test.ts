import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { listOrderSuggestion } from "./list-order-suggestion.js";
import { FakeOrderSuggestionReader } from "./test-support/fake-order-suggestion-reader.js";

const BRANCH = "branch-1";
const NOW = new Date("2026-10-06T15:00:00.000Z");
const ports = { clock: { now: () => NOW }, zoneRules: new FakeZoneRulesSource() };

const YERBA = {
  id: "yerba",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 1, unit: "KG" as const },
  categoryName: "Almacén",
  saleUnit: "UNIT" as const,
};
const QUESO = {
  id: "queso",
  name: "Queso",
  brandName: null,
  netContent: null,
  categoryName: "Fiambres",
  saleUnit: "KG" as const,
};

function offer(
  fields: Partial<{
    productId: string;
    supplierId: string;
    quantity: number;
    priceCents: number;
    listDate: string;
    pricesIncludeVat: boolean;
    vatRate: number | null;
  }> = {},
) {
  return {
    productId: fields.productId ?? "yerba",
    supplier: { id: fields.supplierId ?? "a", name: `Proveedor ${fields.supplierId ?? "a"}` },
    link: { quantity: fields.quantity ?? 12_000, saleUnit: "UNIT" as const, relinkRequired: false },
    priceCents: fields.priceCents ?? 12_000,
    pricesIncludeVat: fields.pricesIncludeVat ?? true,
    vatRate: fields.vatRate ?? null,
    listDate: fields.listDate ?? "2026-10-01",
  };
}

function soldOf(productId: string, quantity: number, weightSource: "SCALE" | null = null) {
  return {
    id: productId,
    path: [productId],
    brandName: null,
    netContent: null,
    weightSource,
    quantity,
    amount: 0,
  };
}

function readerWith(fields: {
  products?: (typeof YERBA | typeof QUESO)[];
  offers?: ReturnType<typeof offer>[];
  sold?: ReturnType<typeof soldOf>[];
  stock?: { productId: string; quantity: number }[];
  coverage?: { productId: string; coverageDays: number }[];
}) {
  const reader = new FakeOrderSuggestionReader(fields.products ?? [YERBA], fields.offers ?? []);
  reader.sold = fields.sold ?? [];
  reader.stock = fields.stock ?? [];
  reader.coverage = fields.coverage ?? [
    { productId: "yerba", coverageDays: 15 },
    { productId: "queso", coverageDays: 15 },
  ];
  return reader;
}

describe("listOrderSuggestion", () => {
  it("asks for the branch's completed sales of the 30 Argentine days ending today", async () => {
    const reader = readerWith({});

    await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(reader.salesQueries).toEqual([
      { locationId: BRANCH, range: { from: "2026-09-07", to: "2026-10-06" } },
    ]);
    expect(reader.stockQueries).toEqual([BRANCH]);
  });

  it("counts today as the Argentine day, not the UTC one", async () => {
    const reader = readerWith({});
    const lateNight = new Date("2026-10-07T01:00:00.000Z");

    await listOrderSuggestion(
      { reader, clock: { now: () => lateNight }, zoneRules: ports.zoneRules },
      { locationId: BRANCH },
    );

    expect(reader.salesQueries[0]?.range.to).toBe("2026-10-06");
  });

  it("suggests whole packages of the supplier to cover the coverage days beyond the stock", async () => {
    const reader = readerWith({
      offers: [offer({ quantity: 12_000, priceCents: 12_000 })],
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 12_000 }],
    });

    const lines = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines).toEqual([
      {
        id: "yerba",
        name: "Yerba",
        brandName: "Piragüé",
        netContent: { quantity: 1, unit: "KG" },
        categoryName: "Almacén",
        saleUnit: "UNIT",
        coverageDays: 15,
        soldQuantity: 120_000,
        stock: 12_000,
        neededQuantity: 48_000,
        offers: [
          {
            supplier: { id: "a", name: "Proveedor a" },
            packageQuantity: 12_000,
            saleUnit: "UNIT",
            priceCents: 12_000,
            pricePerSaleUnit: { numerator: 1_000n, denominator: 1n },
            listDate: "2026-10-01",
            cheapest: true,
            packages: 4,
            quantity: 48_000,
          },
        ],
        unpricedOffers: [],
      },
    ]);
  });

  it("rounds up to the packages of each supplier, cheapest first, flagging the cheapest", async () => {
    const reader = readerWith({
      offers: [
        offer({ supplierId: "a", quantity: 10_000, priceCents: 12_000 }),
        offer({ supplierId: "b", quantity: 20_000, priceCents: 20_000, listDate: "2026-09-20" }),
      ],
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 12_000 }],
    });

    const [line] = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(
      line?.offers.map(({ supplier, cheapest, packages, quantity, listDate }) => ({
        supplier: supplier.id,
        cheapest,
        packages,
        quantity,
        listDate,
      })),
    ).toEqual([
      { supplier: "b", cheapest: true, packages: 3, quantity: 60_000, listDate: "2026-09-20" },
      { supplier: "a", cheapest: false, packages: 5, quantity: 50_000, listDate: "2026-10-01" },
    ]);
  });

  it("suggests a product without a priced offer with the whole units it needs and no supplier", async () => {
    const reader = readerWith({
      offers: [offer({ pricesIncludeVat: false, vatRate: null })],
      sold: [soldOf("yerba", 31)],
    });

    const [line] = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.offers).toEqual([]);
    expect(line?.unpricedOffers.map((entry) => entry.reason)).toEqual(["vat_rate_missing"]);
    expect(line?.neededQuantity).toBe(16_000);
  });

  it("counts the thousandths sold of a product sold by weight", async () => {
    const reader = readerWith({
      products: [QUESO],
      sold: [soldOf("queso", 3_000, "SCALE")],
      stock: [{ productId: "queso", quantity: 500 }],
    });

    const [line] = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line).toMatchObject({ soldQuantity: 3_000, stock: 500, neededQuantity: 1_000 });
  });

  it("adds up the sales of a product reported more than once", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30), soldOf("yerba", 30)] });

    const [line] = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.soldQuantity).toBe(60_000);
  });

  it("treats a product with no stock balance as having none", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30)] });

    const [line] = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line).toMatchObject({ stock: 0, neededQuantity: 15_000 });
  });

  it("suggests nothing for a product with no sales in the period", async () => {
    const reader = readerWith({ stock: [{ productId: "yerba", quantity: 0 }] });

    expect(await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).toEqual([]);
  });

  it("suggests nothing for a product whose stock already covers its coverage days", async () => {
    const reader = readerWith({
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 60_000 }],
    });

    expect(await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).toEqual([]);
  });

  it("uses each product's own coverage days", async () => {
    const reader = readerWith({
      products: [YERBA, { ...QUESO, saleUnit: "UNIT" }],
      sold: [soldOf("yerba", 30), soldOf("queso", 30)],
      coverage: [
        { productId: "yerba", coverageDays: 30 },
        { productId: "queso", coverageDays: 10 },
      ],
    });

    const lines = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines.map((line) => [line.id, line.coverageDays, line.neededQuantity])).toEqual([
      ["queso", 10, 10_000],
      ["yerba", 30, 30_000],
    ]);
  });

  it("suggests nothing for a product whose coverage days are unknown", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30)], coverage: [] });

    expect(await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).toEqual([]);
  });

  it("ignores sales of something that is no longer a product or is not compared", async () => {
    const reader = readerWith({
      sold: [{ ...soldOf("yerba", 30), id: null }, soldOf("retirado", 99)],
    });

    expect(await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).toEqual([]);
  });

  it("sorts the lines by name like the comparison", async () => {
    const reader = readerWith({
      products: [YERBA, { ...QUESO, saleUnit: "UNIT" }],
      sold: [soldOf("yerba", 30), soldOf("queso", 30)],
    });

    const lines = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines.map((line) => line.name)).toEqual(["Queso", "Yerba"]);
  });
});
