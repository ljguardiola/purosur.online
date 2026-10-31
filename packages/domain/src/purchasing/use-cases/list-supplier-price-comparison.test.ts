import { describe, expect, it } from "vitest";
import { listSupplierPriceComparison } from "./list-supplier-price-comparison.js";
import { FakeSupplierPriceComparisonReader } from "./test-support/fake-supplier-price-comparison-reader.js";

const YERBA = {
  id: "product-1",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 1, unit: "KG" as const },
  categoryName: "Almacén",
  saleUnit: "UNIT" as const,
};

function offer(
  fields: Partial<{
    productId: string;
    supplierId: string;
    supplierName: string;
    quantity: number;
    priceCents: number;
    pricesIncludeVat: boolean;
    vatRate: number | null;
    listDate: string;
    relinkRequired: boolean;
    linkSaleUnit: "UNIT" | "KG";
  }> = {},
) {
  return {
    productId: fields.productId ?? "product-1",
    supplier: {
      id: fields.supplierId ?? "supplier-a",
      name: fields.supplierName ?? "Distribuidora Sur",
    },
    link: {
      quantity: fields.quantity ?? 10_000,
      saleUnit: fields.linkSaleUnit ?? "UNIT",
      relinkRequired: fields.relinkRequired ?? false,
    },
    priceCents: fields.priceCents ?? 10_000,
    pricesIncludeVat: fields.pricesIncludeVat ?? true,
    vatRate: fields.vatRate ?? null,
    listDate: fields.listDate ?? "2026-03-01",
  };
}

describe("listSupplierPriceComparison", () => {
  it("compares the offers of a product by price per sale unit, cheapest first and flagged", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({
          supplierId: "a",
          supplierName: "A",
          quantity: 10_000,
          priceCents: 12_000,
        }),
        offer({
          supplierId: "b",
          supplierName: "B",
          quantity: 20_000,
          priceCents: 20_000,
        }),
        offer({ supplierId: "c", supplierName: "C", quantity: 1_000, priceCents: 1_500 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers).toEqual([
      {
        supplier: { id: "b", name: "B" },
        quantity: 20_000,
        saleUnit: "UNIT",
        priceCents: 20_000,
        pricePerSaleUnit: { numerator: 1_000n, denominator: 1n },
        listDate: "2026-03-01",
        cheapest: true,
      },
      {
        supplier: { id: "a", name: "A" },
        quantity: 10_000,
        saleUnit: "UNIT",
        priceCents: 12_000,
        pricePerSaleUnit: { numerator: 1_200n, denominator: 1n },
        listDate: "2026-03-01",
        cheapest: false,
      },
      {
        supplier: { id: "c", name: "C" },
        quantity: 1_000,
        saleUnit: "UNIT",
        priceCents: 1_500,
        pricePerSaleUnit: { numerator: 1_500n, denominator: 1n },
        listDate: "2026-03-01",
        cheapest: false,
      },
    ]);
  });

  it("answers the product with the data to show it", async () => {
    const reader = new FakeSupplierPriceComparisonReader([{ ...YERBA, saleUnit: "KG" }], []);

    expect(await listSupplierPriceComparison(reader)).toEqual([
      { ...YERBA, saleUnit: "KG", offers: [], unpricedOffers: [] },
    ]);
  });

  it("compares a price that includes VAT with one that excludes it after adding the remembered rate", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({ supplierId: "a", priceCents: 12_000, pricesIncludeVat: true }),
        offer({ supplierId: "b", priceCents: 10_000, pricesIncludeVat: false, vatRate: 1050 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers.map((entry) => [entry.supplier.id, entry.cheapest])).toEqual([
      ["b", true],
      ["a", false],
    ]);
    expect(product?.offers[0]?.pricePerSaleUnit).toEqual({ numerator: 1_105n, denominator: 1n });
  });

  it("answers apart, as missing its VAT rate, an offer whose price excludes VAT with no rate known", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({ supplierId: "a", priceCents: 90_000, pricesIncludeVat: false, vatRate: null }),
        offer({ supplierId: "b", priceCents: 20_000 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers.map((entry) => entry.supplier.id)).toEqual(["b"]);
    expect(product?.unpricedOffers).toEqual([
      {
        supplier: { id: "a", name: "Distribuidora Sur" },
        quantity: 10_000,
        saleUnit: "UNIT",
        priceCents: 90_000,
        listDate: "2026-03-01",
        reason: "vat_rate_missing",
      },
    ]);
  });

  it.each([
    ["requiring to be linked again", { relinkRequired: true }],
    ["stated in a sale unit the product no longer has", { linkSaleUnit: "KG" as const }],
  ])(
    "answers apart, with no price per sale unit, an offer through a link %s",
    async (_name, link) => {
      const reader = new FakeSupplierPriceComparisonReader(
        [YERBA],
        [
          offer({ supplierId: "a", priceCents: 1_000, ...link }),
          offer({ supplierId: "b", priceCents: 20_000 }),
        ],
      );

      const [product] = await listSupplierPriceComparison(reader);

      expect(product?.offers.map((entry) => [entry.supplier.id, entry.cheapest])).toEqual([
        ["b", true],
      ]);
      expect(product?.unpricedOffers.map((entry) => [entry.supplier.id, entry.reason])).toEqual([
        ["a", "link_outdated"],
      ]);
    },
  );

  it("tells a link that is outdated before a missing VAT rate", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [offer({ pricesIncludeVat: false, vatRate: null, relinkRequired: true })],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.unpricedOffers.map((entry) => entry.reason)).toEqual(["link_outdated"]);
  });

  it("keeps the products' offers apart when answering those without a price per sale unit", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA, { ...YERBA, id: "product-2", name: "Azúcar" }],
      [offer({ productId: "product-2", pricesIncludeVat: false, vatRate: null })],
    );

    const products = await listSupplierPriceComparison(reader);

    expect(products.map((product) => [product.id, product.unpricedOffers.length])).toEqual([
      ["product-2", 1],
      ["product-1", 0],
    ]);
  });

  it("includes a product with no offer, with an empty list", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA, { ...YERBA, id: "product-2", name: "Azúcar" }],
      [offer({ productId: "product-2" })],
    );

    const products = await listSupplierPriceComparison(reader);

    expect(products.map((product) => [product.id, product.offers.length])).toEqual([
      ["product-2", 1],
      ["product-1", 0],
    ]);
  });

  it("ignores an offer for a product that is not among the active ones", async () => {
    const reader = new FakeSupplierPriceComparisonReader([YERBA], [offer({ productId: "gone" })]);

    const products = await listSupplierPriceComparison(reader);

    expect(products).toHaveLength(1);
    expect(products[0]?.offers).toEqual([]);
  });

  it("keeps the offers of each product apart", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA, { ...YERBA, id: "product-2", name: "Azúcar" }],
      [
        offer({ productId: "product-1", priceCents: 500 }),
        offer({ productId: "product-2", priceCents: 900 }),
      ],
    );

    const products = await listSupplierPriceComparison(reader);

    expect(products.map((product) => product.offers.map((entry) => entry.priceCents))).toEqual([
      [900],
      [500],
    ]);
  });

  it("flags only the first of equally cheap offers, keeping the reader's order among them", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({ supplierId: "a", priceCents: 20_000, quantity: 20_000 }),
        offer({ supplierId: "b", priceCents: 10_000, quantity: 10_000 }),
        offer({ supplierId: "c", priceCents: 30_000, quantity: 20_000 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers.map((entry) => [entry.supplier.id, entry.cheapest])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });

  it("orders the products by name, ignoring accents and case, then by id", async () => {
    const reader = new FakeSupplierPriceComparisonReader([
      { ...YERBA, id: "3", name: "yerba" },
      { ...YERBA, id: "2", name: "Azúcar" },
      { ...YERBA, id: "1", name: "azucar" },
      { ...YERBA, id: "0", name: "Zapallo" },
    ]);

    const products = await listSupplierPriceComparison(reader);

    expect(products.map((product) => product.id)).toEqual(["1", "2", "3", "0"]);
  });
});
