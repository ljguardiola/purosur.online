import { describe, expect, it } from "vitest";
import { DEFAULT_SUPPLIER_ITEM_VAT_RATE, SUPPLIER_ITEM_VAT_RATES } from "../model/supplier-item.js";
import { listSupplierItemLinkChoices } from "./list-supplier-item-link-choices.js";

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

describe("listSupplierItemLinkChoices", () => {
  it("offers the products it is given, in their order, with the unit each is sold by", () => {
    expect(listSupplierItemLinkChoices([HARINA, YERBA], BRANDS).products).toEqual([
      { id: "p-kg", name: "Harina", saleUnit: "KG", brandName: null, netContent: null },
      { id: "p-unit", name: "Yerba", saleUnit: "UNIT", brandName: null, netContent: null },
    ]);
  });

  it("names each product's brand and gives its net content", () => {
    const granola = {
      ...YERBA,
      brandId: "b-kos",
      netContent: { quantity: 1, unit: "KG" },
    } as const;

    const {
      products: [choice],
    } = listSupplierItemLinkChoices([granola], BRANDS);

    expect(choice).toMatchObject({ brandName: "Kos", netContent: { quantity: 1, unit: "KG" } });
  });

  it("leaves the brand name empty when the brand is not among the brands given", () => {
    const orphan = { ...YERBA, brandId: "b-gone" } as const;

    const {
      products: [choice],
    } = listSupplierItemLinkChoices([orphan], BRANDS);

    expect(choice?.brandName).toBeNull();
  });

  it("offers the VAT rates an item may carry and the one preselected", () => {
    const { vatRates } = listSupplierItemLinkChoices([], BRANDS);

    expect(vatRates).toEqual({
      offered: [...SUPPLIER_ITEM_VAT_RATES],
      default: DEFAULT_SUPPLIER_ITEM_VAT_RATE,
    });
  });
});
