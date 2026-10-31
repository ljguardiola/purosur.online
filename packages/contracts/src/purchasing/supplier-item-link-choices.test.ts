import { describe, expect, it } from "vitest";
import { supplierItemLinkChoicesSchema } from "./supplier-item-link-choices.js";

const choices = {
  products: [
    {
      id: "p-1",
      name: "Yerba Piragüé",
      saleUnit: "UNIT",
      brandName: "Piragüé",
      netContent: { quantity: 1, unit: "KG" },
    },
    {
      id: "p-2",
      name: "Harina",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
    },
  ],
  vatRates: { offered: [2100, 1050], default: 2100 },
};

describe("supplierItemLinkChoicesSchema", () => {
  it("accepts products sold by unit and by weight", () => {
    expect(supplierItemLinkChoicesSchema.safeParse(choices).data).toEqual(choices);
  });

  it("accepts no products", () => {
    expect(supplierItemLinkChoicesSchema.safeParse({ ...choices, products: [] }).success).toBe(
      true,
    );
  });

  it("refuses a sale unit the catalog does not know", () => {
    const unknown = { ...choices, products: [{ ...choices.products[0], saleUnit: "LITER" }] };

    expect(supplierItemLinkChoicesSchema.safeParse(unknown).success).toBe(false);
  });

  it.each(["brandName", "netContent"])("refuses a product without its %s", (field) => {
    const { [field]: _missing, ...bare } = choices.products[0] as Record<string, unknown>;

    expect(supplierItemLinkChoicesSchema.safeParse({ ...choices, products: [bare] }).success).toBe(
      false,
    );
  });

  it("refuses a net content with a unit the catalog does not know", () => {
    const unknown = {
      ...choices,
      products: [{ ...choices.products[0], netContent: { quantity: 1, unit: "OZ" } }],
    };

    expect(supplierItemLinkChoicesSchema.safeParse(unknown).success).toBe(false);
  });

  it("refuses choices without the VAT rates", () => {
    const { vatRates: _vatRates, ...bare } = choices;

    expect(supplierItemLinkChoicesSchema.safeParse(bare).success).toBe(false);
  });

  it("refuses a VAT rate the items cannot carry", () => {
    const unknown = { ...choices, vatRates: { offered: [2100, 1234], default: 2100 } };

    expect(supplierItemLinkChoicesSchema.safeParse(unknown).success).toBe(false);
  });

  it("refuses no VAT rate offered", () => {
    const none = { ...choices, vatRates: { offered: [], default: 2100 } };

    expect(supplierItemLinkChoicesSchema.safeParse(none).success).toBe(false);
  });
});
