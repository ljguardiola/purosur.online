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
  active: true,
  version: 1,
};

describe("listPackagings", () => {
  it("answers every packaging with its product's name and sale unit", async () => {
    const bolsa = {
      ...CAJA,
      id: "k-2",
      productId: "p-kg",
      name: "Bolsa x 25 kg",
      quantityPerPackage: 25_000,
      active: false,
    };
    const reader = new FakePurchasingListReader({
      packagings: [bolsa, CAJA],
      products: [YERBA, HARINA],
    });

    const { packagings } = await listPackagings(reader);

    expect(packagings).toEqual([
      { ...bolsa, productName: "Harina", saleUnit: "KG" },
      { ...CAJA, productName: "Yerba", saleUnit: "UNIT" },
    ]);
  });

  it("keeps the packagings of a deactivated product listed", async () => {
    const old = { ...CAJA, productId: "p-old" };
    const reader = new FakePurchasingListReader({ packagings: [old], products: [RETIRED] });

    const { packagings } = await listPackagings(reader);

    expect(packagings).toEqual([{ ...old, productName: "Antiguo", saleUnit: "UNIT" }]);
  });

  it("offers only the active products a packaging may be defined for", async () => {
    const reader = new FakePurchasingListReader({ products: [YERBA, RETIRED, HARINA] });

    const { products } = await listPackagings(reader);

    expect(products).toEqual([
      { id: "p-kg", name: "Harina", saleUnit: "KG" },
      { id: "p-unit", name: "Yerba", saleUnit: "UNIT" },
    ]);
  });

  it("answers nothing when there is nothing to list", async () => {
    expect(await listPackagings(new FakePurchasingListReader())).toEqual({
      packagings: [],
      products: [],
    });
  });
});
