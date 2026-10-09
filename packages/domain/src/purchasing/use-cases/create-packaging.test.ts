import { describe, expect, it } from "vitest";
import { createPackaging } from "./create-packaging.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const ACTOR = "person-1";

function storeWithProducts(): FakePurchasingStore {
  const store = new FakePurchasingStore();
  store.seedProduct({ id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "p-kg", name: "Harina", saleUnit: "KG", active: true });
  return store;
}

describe("createPackaging", () => {
  it("creates an active packaging at version 1 for a product sold by the unit, recording the writer", async () => {
    const store = storeWithProducts();

    const outcome = await createPackaging(store, {
      productId: "p-unit",
      name: "Caja x 12",
      quantityPerPackage: 12_000,
      actorId: ACTOR,
    });

    const expected = {
      id: "packaging-1",
      productId: "p-unit",
      name: "Caja x 12",
      quantityPerPackage: 12_000,
      active: true,
      version: 1,
    };
    expect(outcome).toEqual({ kind: "created", packaging: expected });
    expect(store.snapshot().packagings).toEqual([{ ...expected, writtenBy: ACTOR }]);
    expect(store.lockCallOrder).toEqual(["lockProduct"]);
    expect(store.transactionCount).toBe(1);
  });

  it("accepts a quantity in grams for a product sold by the kilo", async () => {
    const store = storeWithProducts();

    const outcome = await createPackaging(store, {
      productId: "p-kg",
      name: "Bolsa x 25 kg",
      quantityPerPackage: 25_000,
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("created");
  });

  it("answers product_not_found for a product missing when it is locked", async () => {
    const store = storeWithProducts();

    const outcome = await createPackaging(store, {
      productId: "missing",
      name: "Caja",
      quantityPerPackage: 12_000,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "product_not_found" });
    expect(store.snapshot().packagings).toEqual([]);
  });

  it("refuses a fractional unit count for a product sold by the unit, checking it against the locked sale unit", async () => {
    const store = storeWithProducts();

    const outcome = await createPackaging(store, {
      productId: "p-unit",
      name: "Caja",
      quantityPerPackage: 12_500,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot().packagings).toEqual([]);
  });

  it("refuses a name the same product already has, ignoring letter case and including inactive ones", async () => {
    const store = storeWithProducts();
    store.seedPackaging({
      id: "k-1",
      productId: "p-unit",
      name: "Caja x 12",
      quantityPerPackage: 12_000,
      active: false,
      version: 2,
    });

    const outcome = await createPackaging(store, {
      productId: "p-unit",
      name: "CAJA X 12",
      quantityPerPackage: 6_000,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().packagings).toHaveLength(1);
  });

  it("accepts a name another product's packaging has", async () => {
    const store = storeWithProducts();
    store.seedPackaging({
      id: "k-1",
      productId: "p-kg",
      name: "Caja",
      quantityPerPackage: 1_000,
      active: true,
      version: 1,
    });

    const outcome = await createPackaging(store, {
      productId: "p-unit",
      name: "Caja",
      quantityPerPackage: 12_000,
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("created");
  });

  it("answers name_taken when it loses the name to a concurrent write, leaving nothing behind", async () => {
    const store = storeWithProducts();
    store.packagingNameConflicts.add("caja");

    const outcome = await createPackaging(store, {
      productId: "p-unit",
      name: "Caja",
      quantityPerPackage: 12_000,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().packagings).toEqual([]);
  });

  it("does not hide an unexpected failure", async () => {
    const store = storeWithProducts();
    store.transaction = async () => {
      throw new Error("connection lost");
    };

    await expect(
      createPackaging(store, {
        productId: "p-unit",
        name: "Caja",
        quantityPerPackage: 12_000,
        actorId: ACTOR,
      }),
    ).rejects.toThrow("connection lost");
  });
});
