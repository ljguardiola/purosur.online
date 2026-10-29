import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_ITEM_VAT_RATE, SUPPLIER_ITEM_VAT_RATES } from "../model/supplier-item.js";
import { listSupplierItemLinkChoices } from "./list-supplier-item-link-choices.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const YERBA = {
  id: "p-unit",
  name: "Yerba",
  saleUnit: "UNIT",
  active: true,
  brandId: null,
  netContent: null,
} as const;
const HARINA = {
  id: "p-kg",
  name: "Harina",
  saleUnit: "KG",
  active: true,
  brandId: null,
  netContent: null,
} as const;
const BRANDS = [{ id: "b-kos", name: "Kos" }];

function packaging(overrides: {
  id: string;
  name: string;
  productId?: string;
  quantityPerPackage?: number;
  active?: boolean;
  saleUnit?: "UNIT" | "KG";
}) {
  return {
    productId: "p-unit",
    quantityPerPackage: 12_000,
    saleUnit: "UNIT" as const,
    active: true,
    version: 1,
    ...overrides,
  };
}

describe("listSupplierItemLinkChoices", () => {
  it("offers each product with the packagings it may be bought by, by name", async () => {
    const reader = new FakePurchasingListReader({
      products: [YERBA, HARINA],
      packagings: [
        packaging({ id: "k-2", name: "Caja x 24", quantityPerPackage: 24_000 }),
        packaging({ id: "k-1", name: "Caja x 12" }),
        packaging({ id: "k-3", name: "Bolsa", productId: "p-kg", saleUnit: "KG" }),
      ],
    });

    expect((await listSupplierItemLinkChoices(reader, [YERBA, HARINA], BRANDS)).products).toEqual([
      {
        id: "p-unit",
        name: "Yerba",
        saleUnit: "UNIT",
        brandName: null,
        netContent: null,
        packagings: [
          { id: "k-1", name: "Caja x 12", quantityPerPackage: 12_000 },
          { id: "k-2", name: "Caja x 24", quantityPerPackage: 24_000 },
        ],
      },
      {
        id: "p-kg",
        name: "Harina",
        saleUnit: "KG",
        brandName: null,
        netContent: null,
        packagings: [{ id: "k-3", name: "Bolsa", quantityPerPackage: 12_000 }],
      },
    ]);
  });

  it("leaves out the packagings that are deactivated or that count another sale unit", async () => {
    const reader = new FakePurchasingListReader({
      products: [YERBA],
      packagings: [
        packaging({ id: "k-1", name: "Caja x 12" }),
        packaging({ id: "k-2", name: "Vieja", active: false }),
        packaging({ id: "k-3", name: "Por kilo", saleUnit: "KG" }),
      ],
    });

    const {
      products: [yerba],
    } = await listSupplierItemLinkChoices(reader, [YERBA], BRANDS);

    expect(yerba?.packagings.map((choice) => choice.id)).toEqual(["k-1"]);
  });

  it("offers a product that has no packaging yet, so one can be added", async () => {
    const reader = new FakePurchasingListReader({ products: [HARINA] });

    expect((await listSupplierItemLinkChoices(reader, [HARINA], BRANDS)).products).toEqual([
      {
        id: "p-kg",
        name: "Harina",
        saleUnit: "KG",
        brandName: null,
        netContent: null,
        packagings: [],
      },
    ]);
  });

  it("offers a product only the packagings of its own", async () => {
    const otherUnit = { ...YERBA, id: "p-other", name: "Azúcar" } as const;
    const reader = new FakePurchasingListReader({
      products: [YERBA, otherUnit],
      packagings: [packaging({ id: "k-1", name: "Caja x 12", productId: "p-other" })],
    });

    const {
      products: [yerba, azucar],
    } = await listSupplierItemLinkChoices(reader, [YERBA, otherUnit], BRANDS);

    expect(yerba?.packagings).toEqual([]);
    expect(azucar?.packagings.map((choice) => choice.id)).toEqual(["k-1"]);
  });

  it("offers the products it is given, in their order, with nothing else", async () => {
    const reader = new FakePurchasingListReader({
      products: [YERBA, HARINA],
      packagings: [packaging({ id: "k-1", name: "Caja x 12" })],
    });

    const { products } = await listSupplierItemLinkChoices(reader, [HARINA], BRANDS);

    expect(products.map((choice) => choice.id)).toEqual(["p-kg"]);
  });

  it("names each product's brand and gives its net content", async () => {
    const granola = {
      ...YERBA,
      brandId: "b-kos",
      netContent: { quantity: 1, unit: "KG" },
    } as const;
    const reader = new FakePurchasingListReader({ products: [granola] });

    const {
      products: [choice],
    } = await listSupplierItemLinkChoices(reader, [granola], BRANDS);

    expect(choice).toMatchObject({ brandName: "Kos", netContent: { quantity: 1, unit: "KG" } });
  });

  it("leaves the brand name empty when the brand is not among the brands given", async () => {
    const orphan = { ...YERBA, brandId: "b-gone" } as const;
    const reader = new FakePurchasingListReader({ products: [orphan] });

    const {
      products: [choice],
    } = await listSupplierItemLinkChoices(reader, [orphan], BRANDS);

    expect(choice?.brandName).toBeNull();
  });

  it("offers the VAT rates an item may carry and the one preselected", async () => {
    const { vatRates } = await listSupplierItemLinkChoices(
      new FakePurchasingListReader({}),
      [],
      BRANDS,
    );

    expect(vatRates).toEqual({
      offered: [...SUPPLIER_ITEM_VAT_RATES],
      default: DEFAULT_SUPPLIER_ITEM_VAT_RATE,
    });
  });
});
