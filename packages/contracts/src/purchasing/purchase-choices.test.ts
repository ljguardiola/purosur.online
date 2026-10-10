import { describe, expect, it } from "vitest";
import { purchaseChoicesSchema } from "./purchase-choices.js";

const supplier = {
  id: "s-1",
  name: "Distribuidora Sur",
  cuit: null,
  contact: null,
  note: null,
  active: true,
  version: 1,
};
const product = { id: "p-1", name: "Yerba", saleUnit: "UNIT" };
const packaging = {
  id: "k-1",
  productId: "p-1",
  productName: "Yerba",
  productSaleUnit: "UNIT",
  saleUnit: "UNIT",
  saleUnitChanged: false,
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  active: true,
  version: 1,
};
const choices = {
  suppliers: [supplier],
  products: [product],
  packagings: [packaging],
  today: "2026-09-16",
};

describe("purchaseChoicesSchema", () => {
  it("accepts the suppliers, products and packagings a purchase may be registered with, and today", () => {
    expect(purchaseChoicesSchema.safeParse(choices).data).toEqual(choices);
  });

  it("accepts nothing to choose", () => {
    const none = { suppliers: [], products: [], packagings: [], today: "2026-09-16" };
    expect(purchaseChoicesSchema.safeParse(none).data).toEqual(none);
  });

  it.each(["suppliers", "products", "packagings", "today"])("refuses choices without %s", (key) => {
    const { [key as keyof typeof choices]: _missing, ...rest } = choices;
    expect(purchaseChoicesSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["a supplier", { suppliers: [{ ...supplier, active: "yes" }] }],
    ["a product", { products: [{ ...product, saleUnit: "LITRE" }] }],
    ["a packaging", { packagings: [{ ...packaging, quantityPerPackage: 1.5 }] }],
  ])("refuses %s that does not match its shape", (_name, broken) => {
    expect(purchaseChoicesSchema.safeParse({ ...choices, ...broken }).success).toBe(false);
  });

  it.each(["2026-02-30", "16/09/2026", "", 20260916])("refuses %j as today", (today) => {
    expect(purchaseChoicesSchema.safeParse({ ...choices, today }).success).toBe(false);
  });
});
