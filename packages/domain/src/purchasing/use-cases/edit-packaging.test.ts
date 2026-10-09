import { describe, expect, it } from "vitest";
import { editPackaging } from "./edit-packaging.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const ACTOR = "person-1";

const CAJA = {
  id: "k-1",
  productId: "p-unit",
  name: "Caja x 12",
  quantityPerPackage: 12_000,
  active: true,
  version: 3,
};

function storeWithCaja(): FakePurchasingStore {
  const store = new FakePurchasingStore();
  store.seedProduct({ id: "p-unit", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "p-kg", name: "Harina", saleUnit: "KG", active: true });
  store.seedPackaging(CAJA);
  return store;
}

const SAME = { name: CAJA.name, quantityPerPackage: CAJA.quantityPerPackage };

describe("editPackaging", () => {
  it("answers not_found for a packaging missing when its product is locked, locking nothing else", async () => {
    const store = storeWithCaja();

    const outcome = await editPackaging(store, {
      id: "missing",
      ...SAME,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.lockCallOrder).toEqual(["lockProductOfPackaging"]);
  });

  it("answers not_found for a packaging missing when it is locked after its product", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", productId: "gone" });

    const outcome = await editPackaging(store, {
      id: "k-2",
      ...SAME,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("locks the packaging's product first and the packaging second", async () => {
    const store = storeWithCaja();

    await editPackaging(store, { id: "k-1", ...SAME, name: "Caja", version: 3, actorId: ACTOR });

    expect(store.lockCallOrder).toEqual(["lockProductOfPackaging", "lockPackaging"]);
    expect(store.transactionCount).toBe(1);
  });

  it("rejects a stale version", async () => {
    const store = storeWithCaja();

    const outcome = await editPackaging(store, {
      id: "k-1",
      ...SAME,
      name: "Caja",
      version: 2,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("changes the name and quantity, bumping the version, keeping the active state and recording the writer", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "decoy", name: "Decoy", version: 9 });

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "Caja x 6",
      quantityPerPackage: 6_000,
      version: 3,
      actorId: ACTOR,
    });

    const expected = { ...CAJA, name: "Caja x 6", quantityPerPackage: 6_000, version: 4 };
    expect(outcome).toEqual({ kind: "applied", packaging: expected });
    expect(store.snapshot().packagings).toEqual([
      { ...expected, writtenBy: ACTOR },
      expect.objectContaining({ id: "decoy", version: 9, writtenBy: null }),
    ]);
  });

  it("keeps an inactive packaging inactive when editing it", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", name: "Inactiva", active: false });

    const outcome = await editPackaging(store, {
      id: "k-2",
      name: "Inactiva 2",
      quantityPerPackage: 1_000,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toMatchObject({ kind: "applied", packaging: { active: false, version: 4 } });
  });

  it("refuses a quantity the product's sale unit does not take, before anything else", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", name: "Otra" });
    store.packagingNameConflicts.add("otra");

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "Otra",
      quantityPerPackage: 1_500,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot().packagings[0]).toEqual({ ...CAJA, writtenBy: null });
  });

  it("refuses an unchanged invalid quantity too", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", name: "Rota", quantityPerPackage: 1_500 });

    const outcome = await editPackaging(store, {
      id: "k-2",
      name: "Rota",
      quantityPerPackage: 1_500,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "invalid_quantity" });
  });

  it("keeps an unchanged packaging as a no-op that bumps nothing and writes nothing", async () => {
    const store = storeWithCaja();
    store.packagingNameConflicts.add("caja x 12");

    const outcome = await editPackaging(store, { id: "k-1", ...SAME, version: 3, actorId: ACTOR });

    expect(outcome).toEqual({ kind: "applied", packaging: CAJA });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("applies a change of only the quantity, without checking the name it kept", async () => {
    const store = storeWithCaja();

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: CAJA.name,
      quantityPerPackage: 24_000,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({
      kind: "applied",
      packaging: { ...CAJA, quantityPerPackage: 24_000, version: 4 },
    });
  });

  it("applies a change of only the name's letter case", async () => {
    const store = storeWithCaja();

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "CAJA X 12",
      quantityPerPackage: CAJA.quantityPerPackage,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({
      kind: "applied",
      packaging: { ...CAJA, name: "CAJA X 12", version: 4 },
    });
  });

  it("refuses a name another packaging of the same product has, including inactive ones", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", name: "Pack", active: false });

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "PACK",
      quantityPerPackage: CAJA.quantityPerPackage,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("accepts a name another product's packaging has", async () => {
    const store = storeWithCaja();
    store.seedPackaging({ ...CAJA, id: "k-2", productId: "p-kg", name: "Pack" });

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "Pack",
      quantityPerPackage: CAJA.quantityPerPackage,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("applied");
  });

  it("answers name_taken when it loses the name to a concurrent write, changing nothing", async () => {
    const store = storeWithCaja();
    store.packagingNameConflicts.add("pack");

    const outcome = await editPackaging(store, {
      id: "k-1",
      name: "Pack",
      quantityPerPackage: CAJA.quantityPerPackage,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("does not hide an unexpected failure", async () => {
    const store = storeWithCaja();
    store.transaction = async () => {
      throw new Error("connection lost");
    };

    await expect(
      editPackaging(store, { id: "k-1", ...SAME, version: 3, actorId: ACTOR }),
    ).rejects.toThrow("connection lost");
  });
});
