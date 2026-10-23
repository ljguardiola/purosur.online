import { describe, expect, it } from "vitest";
import { listSupplierPriceComparison } from "./list-supplier-price-comparison.js";
import { FakeSupplierPriceComparisonReader } from "./test-support/fake-supplier-price-comparison-reader.js";

const YERBA = {
  id: "product-1",
  name: "Yerba Taragüi 1 kg",
  categoryName: "Almacén",
  saleUnit: "UNIT" as const,
};

function offer(
  fields: Partial<{
    productId: string;
    supplierId: string;
    supplierName: string;
    packagingName: string;
    quantityPerPackage: number;
    priceCents: number;
    pricesIncludeVat: boolean;
    vatRate: number | null;
    listDate: string;
  }> = {},
) {
  return {
    productId: fields.productId ?? "product-1",
    supplier: {
      id: fields.supplierId ?? "supplier-a",
      name: fields.supplierName ?? "Distribuidora Sur",
    },
    packaging: {
      name: fields.packagingName ?? "Caja x 10",
      quantityPerPackage: fields.quantityPerPackage ?? 10_000,
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
          quantityPerPackage: 10_000,
          priceCents: 12_000,
        }),
        offer({
          supplierId: "b",
          supplierName: "B",
          quantityPerPackage: 20_000,
          priceCents: 20_000,
        }),
        offer({ supplierId: "c", supplierName: "C", quantityPerPackage: 1_000, priceCents: 1_500 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers).toEqual([
      {
        supplier: { id: "b", name: "B" },
        packagingName: "Caja x 10",
        quantityPerPackage: 20_000,
        priceCents: 20_000,
        pricePerSaleUnit: { numerator: 1_000n, denominator: 1n },
        listDate: "2026-03-01",
        cheapest: true,
      },
      {
        supplier: { id: "a", name: "A" },
        packagingName: "Caja x 10",
        quantityPerPackage: 10_000,
        priceCents: 12_000,
        pricePerSaleUnit: { numerator: 1_200n, denominator: 1n },
        listDate: "2026-03-01",
        cheapest: false,
      },
      {
        supplier: { id: "c", name: "C" },
        packagingName: "Caja x 10",
        quantityPerPackage: 1_000,
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
      { ...YERBA, saleUnit: "KG", offers: [] },
    ]);
  });

  it("compares a price that includes VAT with one that excludes it after adding the remembered rate", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({ supplierId: "a", priceCents: 11_000, pricesIncludeVat: true }),
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

  it("leaves out an offer whose price excludes VAT with no rate known", async () => {
    const reader = new FakeSupplierPriceComparisonReader(
      [YERBA],
      [
        offer({ supplierId: "a", priceCents: 90_000, pricesIncludeVat: false, vatRate: null }),
        offer({ supplierId: "b", priceCents: 20_000 }),
      ],
    );

    const [product] = await listSupplierPriceComparison(reader);

    expect(product?.offers.map((entry) => entry.supplier.id)).toEqual(["b"]);
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
        offer({ supplierId: "a", priceCents: 20_000, quantityPerPackage: 20_000 }),
        offer({ supplierId: "b", priceCents: 10_000, quantityPerPackage: 10_000 }),
        offer({ supplierId: "c", priceCents: 30_000, quantityPerPackage: 20_000 }),
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
