import { describe, expect, it } from "vitest";
import { findPackagingListing } from "./find-packaging-listing.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const YERBA = { id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true } as const;
const CAJA = {
  id: "k-1",
  productId: "p-unit",
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  saleUnit: "UNIT" as const,
  active: true,
  version: 1,
};

describe("findPackagingListing", () => {
  it("answers the packaging with its product's name and current sale unit", async () => {
    const other = { ...CAJA, id: "k-2", name: "Bolsa" };
    const reader = new FakePurchasingListReader({ packagings: [other, CAJA], products: [YERBA] });

    expect(await findPackagingListing(reader, "k-1")).toEqual({
      ...CAJA,
      productName: "Yerba",
      productSaleUnit: "UNIT",
      saleUnitChanged: false,
    });
  });

  it("answers that the sale unit changed for a packaging stated in one its product no longer has", async () => {
    const bolsa = { ...CAJA, saleUnit: "KG" as const };
    const reader = new FakePurchasingListReader({ packagings: [bolsa], products: [YERBA] });

    expect(await findPackagingListing(reader, "k-1")).toEqual({
      ...bolsa,
      productName: "Yerba",
      productSaleUnit: "UNIT",
      saleUnitChanged: true,
    });
  });

  it("answers nothing for a packaging that does not exist", async () => {
    const reader = new FakePurchasingListReader({ packagings: [CAJA], products: [YERBA] });

    expect(await findPackagingListing(reader, "k-9")).toBeUndefined();
  });
});
