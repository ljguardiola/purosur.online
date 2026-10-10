import { describe, expect, it } from "vitest";
import { listPackagings } from "./list-packagings.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const YERBA = { id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true } as const;
const HARINA = { id: "p-kg", name: "Harina", saleUnit: "KG", active: true } as const;
const RETIRED = { id: "p-old", name: "Antiguo", saleUnit: "UNIT", active: false } as const;

const CAJA = {
  id: "k-1",
  productId: "p-unit",
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  saleUnit: "UNIT" as const,
  active: true,
  version: 1,
};

describe("listPackagings", () => {
  it("answers every packaging with its product's name and current sale unit", async () => {
    const bolsa = {
      ...CAJA,
      id: "k-2",
      productId: "p-kg",
      name: "Bolsa x 25 kg",
      quantityPerPackage: 25_000,
      saleUnit: "KG" as const,
      active: false,
    };
    const reader = new FakePurchasingListReader({
      packagings: [bolsa, CAJA],
      products: [YERBA, HARINA],
    });

    expect(await listPackagings(reader)).toEqual([
      { ...bolsa, productName: "Harina", productSaleUnit: "KG" },
      { ...CAJA, productName: "Yerba", productSaleUnit: "UNIT" },
    ]);
  });

  it("keeps the sale unit a packaging's quantity is stated in apart from its product's current one", async () => {
    const bolsa = { ...CAJA, saleUnit: "KG" as const, active: false };
    const reader = new FakePurchasingListReader({ packagings: [bolsa], products: [YERBA] });

    expect(await listPackagings(reader)).toEqual([
      { ...bolsa, productName: "Yerba", productSaleUnit: "UNIT" },
    ]);
  });

  it("keeps the packagings of a deactivated product listed", async () => {
    const old = { ...CAJA, productId: "p-old" };
    const reader = new FakePurchasingListReader({ packagings: [old], products: [RETIRED] });

    expect(await listPackagings(reader)).toEqual([
      { ...old, productName: "Antiguo", productSaleUnit: "UNIT" },
    ]);
  });

  it("answers nothing when there is nothing to list", async () => {
    expect(await listPackagings(new FakePurchasingListReader())).toEqual([]);
  });
});
