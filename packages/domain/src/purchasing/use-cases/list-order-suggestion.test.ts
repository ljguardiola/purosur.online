import { describe, expect, it } from "vitest";
import type { SoldLinesOfGroup } from "../../sales/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { listOrderSuggestion } from "./list-order-suggestion.js";
import type { ComparableProduct } from "./supplier-price-comparison-reader.js";
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
    relinkRequired: boolean;
  }> = {},
) {
  return {
    productId: fields.productId ?? "yerba",
    supplier: { id: fields.supplierId ?? "a", name: `Proveedor ${fields.supplierId ?? "a"}` },
    link: {
      quantity: fields.quantity ?? 12_000,
      saleUnit: "UNIT" as const,
      relinkRequired: fields.relinkRequired ?? false,
    },
    priceCents: fields.priceCents ?? 12_000,
    pricesIncludeVat: fields.pricesIncludeVat ?? true,
    vatRate: fields.vatRate ?? null,
    listDate: fields.listDate ?? "2026-10-01",
  };
}

function soldOf(
  productId: string | null,
  quantity: number,
  weightSource: "SCALE" | null = null,
): SoldLinesOfGroup {
  return {
    id: productId,
    path: [String(productId)],
    brandName: null,
    netContent: null,
    weightSource,
    quantity,
    amount: 0,
  };
}

function readerWith(fields: {
  products?: ComparableProduct[];
  offers?: ReturnType<typeof offer>[];
  sold?: SoldLinesOfGroup[];
  stock?: { productId: string; quantity: number }[];
  coverage?: { productId: string; coverageDays: number }[];
  suppliers?: { id: string; name: string; active: boolean }[];
  shelfLifeLots?: { productId: string; createdAt: Date; expiresOn: string }[];
}) {
  const reader = new FakeOrderSuggestionReader(fields.products ?? [YERBA], fields.offers ?? []);
  reader.supplierList = fields.suppliers ?? [];
  reader.shelfLifeLots = fields.shelfLifeLots ?? [];
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

    const { lines } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines).toEqual([
      {
        id: "yerba",
        name: "Yerba",
        brandName: "Piragüé",
        netContent: { quantity: 1, unit: "KG" },
        categoryName: "Almacén",
        saleUnit: "UNIT",
        coverageDays: 15,
        effectiveDays: 15,
        cappedByExpiry: false,
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

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

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

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.offers).toEqual([]);
    expect(line?.unpricedOffers.map((entry) => entry.reason)).toEqual(["vat_rate_missing"]);
    expect(line?.neededQuantity).toBe(16_000);
  });

  it("answers the packages an offer missing its VAT rate covers, as its link states them", async () => {
    const reader = readerWith({
      offers: [offer({ quantity: 12_000, pricesIncludeVat: false, vatRate: null })],
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 12_000 }],
    });

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.unpricedOffers).toEqual([
      {
        supplier: { id: "a", name: "Proveedor a" },
        packageQuantity: 12_000,
        saleUnit: "UNIT",
        priceCents: 12_000,
        listDate: "2026-10-01",
        reason: "vat_rate_missing",
        order: { packages: 4, quantity: 48_000 },
      },
    ]);
  });

  it("answers no packages for an offer whose link has to be made again", async () => {
    const reader = readerWith({
      offers: [offer({ relinkRequired: true })],
      sold: [soldOf("yerba", 120)],
    });

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.unpricedOffers).toMatchObject([{ reason: "link_outdated", order: null }]);
  });

  it("offers only the suppliers that may be purchased from", async () => {
    const reader = readerWith({
      suppliers: [
        { id: "a", name: "Proveedor a", active: true },
        { id: "b", name: "Proveedor b", active: false },
      ],
    });

    const { suppliers } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(suppliers).toEqual([{ id: "a", name: "Proveedor a" }]);
  });

  it("counts the thousandths sold of a product sold by weight", async () => {
    const reader = readerWith({
      products: [QUESO],
      sold: [soldOf("queso", 3_000, "SCALE")],
      stock: [{ productId: "queso", quantity: 500 }],
    });

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line).toMatchObject({ soldQuantity: 3_000, stock: 500, neededQuantity: 1_000 });
  });

  it("adds up the sales of a product reported more than once", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30), soldOf("yerba", 30)] });

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line?.soldQuantity).toBe(60_000);
  });

  it("treats a product with no stock balance as having none", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30)] });

    const {
      lines: [line],
    } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(line).toMatchObject({ stock: 0, neededQuantity: 15_000 });
  });

  it("suggests nothing for a product with no sales in the period", async () => {
    const reader = readerWith({ stock: [{ productId: "yerba", quantity: 0 }] });

    expect((await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).lines).toEqual(
      [],
    );
  });

  it("counts a product with no sales in the period as sold none, still covering a negative stock", async () => {
    const reader = readerWith({ stock: [{ productId: "yerba", quantity: -5_000 }] });

    const { lines } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines).toMatchObject([
      { id: "yerba", soldQuantity: 0, stock: -5_000, neededQuantity: 5_000 },
    ]);
  });

  it("suggests nothing for a product whose stock already covers its coverage days", async () => {
    const reader = readerWith({
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 60_000 }],
    });

    expect((await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).lines).toEqual(
      [],
    );
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

    const { lines } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines.map((line) => [line.id, line.coverageDays, line.neededQuantity])).toEqual([
      ["queso", 10, 10_000],
      ["yerba", 30, 30_000],
    ]);
  });

  it("suggests nothing for a product whose coverage days are unknown", async () => {
    const reader = readerWith({ sold: [soldOf("yerba", 30)], coverage: [] });

    expect((await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).lines).toEqual(
      [],
    );
  });

  it("ignores sales of something that is no longer a product or is not compared", async () => {
    const reader = readerWith({
      sold: [soldOf(null, 30), soldOf("retirado", 99)],
    });

    expect((await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).lines).toEqual(
      [],
    );
  });

  it("sorts the lines by name like the comparison", async () => {
    const reader = readerWith({
      products: [YERBA, { ...QUESO, saleUnit: "UNIT" }],
      sold: [soldOf("yerba", 30), soldOf("queso", 30)],
    });

    const { lines } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

    expect(lines.map((line) => line.name)).toEqual(["Queso", "Yerba"]);
  });

  describe("with the shelf life of the newest lot", () => {
    const lotOf = (createdAt: string, expiresOn: string, productId = "yerba") => ({
      productId,
      createdAt: new Date(createdAt),
      expiresOn,
    });
    const fourADay = {
      sold: [soldOf("yerba", 120)],
      stock: [{ productId: "yerba", quantity: 20_000 }],
    };

    it("asks for the newest lots of the branch", async () => {
      const reader = readerWith({});

      await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(reader.shelfLifeQueries).toEqual([BRANCH]);
    });

    it("uses the shelf life instead of the coverage days and rounds down to the packages that sell before expiry", async () => {
      const reader = readerWith({
        ...fourADay,
        offers: [offer({ quantity: 12_000 })],
        shelfLifeLots: [lotOf("2026-09-26T15:00:00.000Z", "2026-10-06")],
      });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(line).toMatchObject({
        coverageDays: 15,
        effectiveDays: 10,
        cappedByExpiry: true,
        neededQuantity: 20_000,
      });
      expect(line?.offers).toMatchObject([{ packages: 1, quantity: 12_000 }]);
    });

    it("suggests the packages of the coverage days when no lot gives a shelf life", async () => {
      const reader = readerWith({ ...fourADay, offers: [offer({ quantity: 12_000 })] });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(line).toMatchObject({
        effectiveDays: 15,
        cappedByExpiry: false,
        neededQuantity: 40_000,
      });
      expect(line?.offers).toMatchObject([{ packages: 4, quantity: 48_000 }]);
    });

    it("uses the coverage days when the shelf life is longer", async () => {
      const reader = readerWith({
        ...fourADay,
        offers: [offer({ quantity: 12_000 })],
        shelfLifeLots: [lotOf("2026-08-27T15:00:00.000Z", "2026-10-06")],
      });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(line).toMatchObject({ effectiveDays: 15, cappedByExpiry: false });
      expect(line?.offers).toMatchObject([{ packages: 4, quantity: 48_000 }]);
    });

    it("counts the shelf life from the Argentine day the lot was created, not the UTC one", async () => {
      const reader = readerWith({
        ...fourADay,
        shelfLifeLots: [lotOf("2026-09-27T01:00:00.000Z", "2026-10-06")],
      });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(line).toMatchObject({ effectiveDays: 10, cappedByExpiry: true });
    });

    it("keeps an offer at zero packages when its package holds more than can sell before expiry", async () => {
      const reader = readerWith({
        ...fourADay,
        offers: [
          offer({ supplierId: "a", quantity: 12_000, priceCents: 12_000 }),
          offer({ supplierId: "b", quantity: 48_000, priceCents: 40_000 }),
          offer({ supplierId: "c", quantity: 48_000, pricesIncludeVat: false, vatRate: null }),
        ],
        shelfLifeLots: [lotOf("2026-09-26T15:00:00.000Z", "2026-10-06")],
      });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(
        line?.offers.map(({ supplier, packages, quantity }) => [supplier.id, packages, quantity]),
      ).toEqual([
        ["b", 0, 0],
        ["a", 1, 12_000],
      ]);
      expect(line?.unpricedOffers).toMatchObject([{ order: { packages: 0, quantity: 0 } }]);
    });

    it("caps the quantity to order without a supplier at what sells before expiry", async () => {
      const reader = readerWith({
        sold: [soldOf("yerba", 31)],
        shelfLifeLots: [lotOf("2026-09-26T15:00:00.000Z", "2026-10-06")],
      });

      const {
        lines: [line],
      } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(line?.neededQuantity).toBe(10_000);
    });

    it("suggests nothing for a lot that expires the day it was created and no stock to cover", async () => {
      const reader = readerWith({
        sold: [soldOf("yerba", 31)],
        shelfLifeLots: [lotOf("2026-10-06T15:00:00.000Z", "2026-10-06")],
      });

      expect(
        (await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH })).lines,
      ).toEqual([]);
    });

    it("caps each product by its own newest lot", async () => {
      const reader = readerWith({
        products: [YERBA, { ...QUESO, saleUnit: "UNIT" }],
        sold: [soldOf("yerba", 120), soldOf("queso", 120)],
        shelfLifeLots: [lotOf("2026-09-26T15:00:00.000Z", "2026-10-06", "queso")],
      });

      const { lines } = await listOrderSuggestion({ reader, ...ports }, { locationId: BRANCH });

      expect(lines.map((line) => [line.id, line.effectiveDays, line.cappedByExpiry])).toEqual([
        ["queso", 10, true],
        ["yerba", 15, false],
      ]);
    });
  });
});
