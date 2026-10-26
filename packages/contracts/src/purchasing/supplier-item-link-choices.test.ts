import { describe, expect, it } from "vitest";
import { supplierItemLinkChoicesSchema } from "./supplier-item-link-choices.js";

const choices = {
  products: [
    {
      id: "p-1",
      name: "Yerba Taragüi",
      saleUnit: "UNIT",
      packagings: [{ id: "pk-1", name: "Caja x 10", quantityPerPackage: 10_000 }],
    },
    { id: "p-2", name: "Harina", saleUnit: "KG", packagings: [] },
  ],
  vatRates: { offered: [2100, 1050], default: 2100 },
};

describe("supplierItemLinkChoicesSchema", () => {
  it("accepts products with and without packagings", () => {
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

  it("refuses a product without its packagings", () => {
    const { packagings: _packagings, ...bare } = choices.products[0] as object & {
      packagings: unknown;
    };

    expect(supplierItemLinkChoicesSchema.safeParse({ ...choices, products: [bare] }).success).toBe(
      false,
    );
  });

  it("refuses a packaging whose quantity is not a whole number", () => {
    const fractional = {
      ...choices,
      products: [
        {
          ...choices.products[0],
          packagings: [{ id: "pk-1", name: "Caja", quantityPerPackage: 1.5 }],
        },
      ],
    };

    expect(supplierItemLinkChoicesSchema.safeParse(fractional).success).toBe(false);
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
