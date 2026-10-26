import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_ITEM_VAT_RATE, SUPPLIER_ITEM_VAT_RATES } from "../model/supplier-item.js";
import { listSupplierItemLinkChoices } from "./list-supplier-item-link-choices.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const YERBA = { id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true } as const;
const HARINA = { id: "p-kg", name: "Harina", saleUnit: "KG", active: true } as const;

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

    expect((await listSupplierItemLinkChoices(reader, [YERBA, HARINA])).products).toEqual([
      {
        id: "p-unit",
        name: "Yerba",
        saleUnit: "UNIT",
        packagings: [
          { id: "k-1", name: "Caja x 12", quantityPerPackage: 12_000 },
          { id: "k-2", name: "Caja x 24", quantityPerPackage: 24_000 },
        ],
      },
      {
        id: "p-kg",
        name: "Harina",
        saleUnit: "KG",
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
    } = await listSupplierItemLinkChoices(reader, [YERBA]);

    expect(yerba?.packagings.map((choice) => choice.id)).toEqual(["k-1"]);
  });

  it("offers a product that has no packaging yet, so one can be added", async () => {
    const reader = new FakePurchasingListReader({ products: [HARINA] });

    expect((await listSupplierItemLinkChoices(reader, [HARINA])).products).toEqual([
      { id: "p-kg", name: "Harina", saleUnit: "KG", packagings: [] },
    ]);
  });

  it("offers a product only the packagings of its own", async () => {
    const otherUnit = { id: "p-other", name: "Azúcar", saleUnit: "UNIT", active: true } as const;
    const reader = new FakePurchasingListReader({
      products: [YERBA, otherUnit],
      packagings: [packaging({ id: "k-1", name: "Caja x 12", productId: "p-other" })],
    });

    const {
      products: [yerba, azucar],
    } = await listSupplierItemLinkChoices(reader, [YERBA, otherUnit]);

    expect(yerba?.packagings).toEqual([]);
    expect(azucar?.packagings.map((choice) => choice.id)).toEqual(["k-1"]);
  });

  it("offers the products it is given, in their order, with nothing else", async () => {
    const reader = new FakePurchasingListReader({
      products: [YERBA, HARINA],
      packagings: [packaging({ id: "k-1", name: "Caja x 12" })],
    });

    const { products } = await listSupplierItemLinkChoices(reader, [HARINA]);

    expect(products.map((choice) => choice.id)).toEqual(["p-kg"]);
  });

  it("offers the VAT rates an item may carry and the one preselected", async () => {
    const { vatRates } = await listSupplierItemLinkChoices(new FakePurchasingListReader({}), []);

    expect(vatRates).toEqual({
      offered: [...SUPPLIER_ITEM_VAT_RATES],
      default: DEFAULT_SUPPLIER_ITEM_VAT_RATE,
    });
  });
});
