import { describe, expect, it } from "vitest";
import { packagingListSchema, packagingSummarySchema } from "./packaging-summary.js";

const caja = {
  id: "k-1",
  productId: "p-1",
  productName: "Yerba",
  productSaleUnit: "UNIT",
  saleUnit: "UNIT",
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  active: true,
  version: 1,
};
const bolsa = {
  id: "k-2",
  productId: "p-2",
  productName: "Harina",
  productSaleUnit: "UNIT",
  saleUnit: "KG",
  name: "Bolsa x 25 kg",
  quantityPerPackage: 25_000,
  active: false,
  version: 4,
};
const product = { id: "p-1", name: "Yerba", saleUnit: "UNIT" };

describe("packagingSummarySchema", () => {
  it("accepts a packaging stated in units and one stated in kilos, whatever its product is sold by now", () => {
    expect(packagingSummarySchema.safeParse(caja).data).toEqual(caja);
    expect(packagingSummarySchema.safeParse(bolsa).data).toEqual(bolsa);
  });

  it("strips keys it does not define", () => {
    expect(packagingSummarySchema.safeParse({ ...caja, createdAt: "today" }).data).toEqual(caja);
  });

  it.each([
    "id",
    "productId",
    "productName",
    "productSaleUnit",
    "saleUnit",
    "name",
    "quantityPerPackage",
    "active",
    "version",
  ])("requires %s", (field) => {
    const { [field as keyof typeof caja]: _omitted, ...rest } = caja;

    expect(packagingSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["productId", null],
    ["productName", 1],
    ["productSaleUnit", "LITER"],
    ["saleUnit", "LITER"],
    ["name", null],
    ["quantityPerPackage", 1.5],
    ["quantityPerPackage", "12"],
    ["active", "true"],
    ["version", 1.5],
  ])("refuses %s as %j", (field, value) => {
    expect(packagingSummarySchema.safeParse({ ...caja, [field]: value }).success).toBe(false);
  });
});

describe("packagingListSchema", () => {
  it("accepts packagings with the products one may be defined for", () => {
    const list = { packagings: [caja, bolsa], products: [product] };

    expect(packagingListSchema.safeParse(list).data).toEqual(list);
    expect(packagingListSchema.safeParse({ packagings: [], products: [] }).data).toEqual({
      packagings: [],
      products: [],
    });
  });

  it("strips keys of a product it does not define", () => {
    expect(
      packagingListSchema.safeParse({ packagings: [], products: [{ ...product, active: true }] })
        .data?.products,
    ).toEqual([product]);
  });

  it.each([
    undefined,
    null,
    [],
    { packagings: [] },
    { products: [] },
    { packagings: [{ ...caja, saleUnit: "x" }], products: [] },
    { packagings: [], products: [{ id: "p", name: "n", saleUnit: "x" }] },
  ])("refuses %j as a list", (body) => {
    expect(packagingListSchema.safeParse(body).success).toBe(false);
  });
});
