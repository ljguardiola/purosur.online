import { describe, expect, it } from "vitest";
import { reactivatePackaging } from "./reactivate-packaging.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const ACTOR = "person-1";

const CAJA = {
  id: "k-1",
  productId: "p-unit",
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  saleUnit: "UNIT" as const,
  active: true,
  version: 3,
};

function storeWithProduct(): FakePurchasingStore {
  const store = new FakePurchasingStore();
  store.seedProduct({ id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true });
  return store;
}

describe("reactivatePackaging", () => {
  it("answers not_found for a missing packaging, locking nothing else", async () => {
    const store = storeWithProduct();
    store.seedPackaging(CAJA);

    expect(await reactivatePackaging(store, { id: "missing", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
    expect(store.lockCallOrder).toEqual(["lockProductOfPackaging"]);
  });

  it("answers not_found for a packaging missing when it is locked after its product", async () => {
    const store = storeWithProduct();
    store.seedPackaging({ ...CAJA, active: false });
    store.packagingsGoneOnceTheirProductIsLocked.add("k-1");

    expect(await reactivatePackaging(store, { id: "k-1", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.lockCallOrder).toEqual(["lockProductOfPackaging", "lockPackaging"]);
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, active: false, writtenBy: null }]);
  });

  it("answers not_found for a packaging whose product is missing when it is locked", async () => {
    const store = storeWithProduct();
    store.seedPackaging({ ...CAJA, id: "k-2", productId: "gone", active: false });

    expect(await reactivatePackaging(store, { id: "k-2", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
  });

  it("answers already_active for an active packaging, changing nothing", async () => {
    const store = storeWithProduct();
    store.seedPackaging(CAJA);

    expect(await reactivatePackaging(store, { id: "k-1", actorId: ACTOR })).toEqual({
      kind: "already_active",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("refuses a packaging whose quantity is stated in a sale unit its product no longer has, changing nothing", async () => {
    const store = storeWithProduct();
    const bolsa = { ...CAJA, quantityPerPackage: 1_500, saleUnit: "KG" as const, active: false };
    store.seedPackaging(bolsa);

    expect(await reactivatePackaging(store, { id: "k-1", actorId: ACTOR })).toEqual({
      kind: "sale_unit_changed",
    });
    expect(store.snapshot().packagings).toEqual([{ ...bolsa, writtenBy: null }]);
  });

  it("only flips the active state back and bumps the version, recording the writer", async () => {
    const store = storeWithProduct();
    store.seedPackaging({ ...CAJA, id: "decoy", name: "Decoy", active: false });
    store.seedPackaging({ ...CAJA, active: false });

    const outcome = await reactivatePackaging(store, { id: "k-1", actorId: ACTOR });

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().packagings).toEqual([
      expect.objectContaining({ id: "decoy", active: false, version: 3, writtenBy: null }),
      { ...CAJA, active: true, version: 4, writtenBy: ACTOR },
    ]);
  });

  it("locks the packaging's product first and the packaging second", async () => {
    const store = storeWithProduct();
    store.seedPackaging({ ...CAJA, active: false });

    await reactivatePackaging(store, { id: "k-1", actorId: ACTOR });

    expect(store.lockCallOrder).toEqual(["lockProductOfPackaging", "lockPackaging"]);
    expect(store.transactionCount).toBe(1);
  });
});
