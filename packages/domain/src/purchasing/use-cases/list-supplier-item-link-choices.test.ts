import { describe, expect, it } from "vitest";
import type { ProductActivityScope } from "../../catalog/index.js";
import {
  DEFAULT_SUPPLIER_ITEM_VAT_RATE,
  PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO,
  SUPPLIER_ITEM_VAT_RATES,
} from "../model/supplier-item.js";
import {
  type LinkChoiceProduct,
  listSupplierItemLinkChoices,
} from "./list-supplier-item-link-choices.js";

const YERBA: LinkChoiceProduct = {
  id: "p-unit",
  name: "Yerba",
  saleUnit: "UNIT",
  brandId: null,
  netContent: null,
};
const HARINA: LinkChoiceProduct = {
  id: "p-kg",
  name: "Harina",
  saleUnit: "KG",
  brandId: null,
  netContent: null,
};
const BRANDS = [{ id: "b-kos", name: "Kos" }];

function catalogOf(productsByScope: Partial<Record<ProductActivityScope, LinkChoiceProduct[]>>) {
  return {
    products: async (scope: ProductActivityScope) => productsByScope[scope] ?? [],
  };
}

describe("listSupplierItemLinkChoices", () => {
  it("offers only the products a supplier item may be linked to", async () => {
    const catalog = catalogOf({
      [PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]: [YERBA],
      any: [YERBA, HARINA],
      inactive: [HARINA],
    });

    const { products } = await listSupplierItemLinkChoices(catalog, BRANDS);

    expect(products.map((product) => product.id)).toEqual(["p-unit"]);
  });

  it("offers the products in the order the catalog gives them, with the unit each is sold by", async () => {
    const catalog = catalogOf({ [PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]: [HARINA, YERBA] });

    expect((await listSupplierItemLinkChoices(catalog, BRANDS)).products).toEqual([
      { id: "p-kg", name: "Harina", saleUnit: "KG", brandName: null, netContent: null },
      { id: "p-unit", name: "Yerba", saleUnit: "UNIT", brandName: null, netContent: null },
    ]);
  });

  it("names each product's brand and gives its net content", async () => {
    const granola: LinkChoiceProduct = {
      ...YERBA,
      brandId: "b-kos",
      netContent: { quantity: 1, unit: "KG" },
    };
    const catalog = catalogOf({ [PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]: [granola] });

    const {
      products: [choice],
    } = await listSupplierItemLinkChoices(catalog, BRANDS);

    expect(choice).toMatchObject({ brandName: "Kos", netContent: { quantity: 1, unit: "KG" } });
  });

  it("leaves the brand name empty when the brand is not among the brands given", async () => {
    const orphan: LinkChoiceProduct = { ...YERBA, brandId: "b-gone" };
    const catalog = catalogOf({ [PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]: [orphan] });

    const {
      products: [choice],
    } = await listSupplierItemLinkChoices(catalog, BRANDS);

    expect(choice?.brandName).toBeNull();
  });

  it("offers the VAT rates an item may carry and the one preselected", async () => {
    const { vatRates } = await listSupplierItemLinkChoices(catalogOf({}), BRANDS);

    expect(vatRates).toEqual({
      offered: [...SUPPLIER_ITEM_VAT_RATES],
      default: DEFAULT_SUPPLIER_ITEM_VAT_RATE,
    });
  });
});
