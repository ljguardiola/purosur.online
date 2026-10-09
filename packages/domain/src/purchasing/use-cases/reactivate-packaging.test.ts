import { describe, expect, it } from "vitest";
import { reactivatePackaging } from "./reactivate-packaging.js";
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

describe("reactivatePackaging", () => {
  it("answers not_found for a missing packaging", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging(CAJA);

    expect(await reactivatePackaging(store, { id: "missing", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("answers already_active for an active packaging, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging(CAJA);

    expect(await reactivatePackaging(store, { id: "k-1", actorId: ACTOR })).toEqual({
      kind: "already_active",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("only flips the active state back and bumps the version, recording the writer", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging({ ...CAJA, id: "decoy", name: "Decoy", active: false });
    store.seedPackaging({ ...CAJA, active: false });

    const outcome = await reactivatePackaging(store, { id: "k-1", actorId: ACTOR });

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().packagings).toEqual([
      expect.objectContaining({ id: "decoy", active: false, version: 3, writtenBy: null }),
      { ...CAJA, active: true, version: 4, writtenBy: ACTOR },
    ]);
    expect(store.lockCallOrder).toEqual(["lockPackaging"]);
  });
});
