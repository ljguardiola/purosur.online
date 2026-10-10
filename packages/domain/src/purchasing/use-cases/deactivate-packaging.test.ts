import { describe, expect, it } from "vitest";
import { deactivatePackaging } from "./deactivate-packaging.js";
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

describe("deactivatePackaging", () => {
  it("answers not_found for a missing packaging", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging(CAJA);

    expect(await deactivatePackaging(store, { id: "missing", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, writtenBy: null }]);
  });

  it("answers already_inactive for a deactivated packaging, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging({ ...CAJA, active: false });

    expect(await deactivatePackaging(store, { id: "k-1", actorId: ACTOR })).toEqual({
      kind: "already_inactive",
    });
    expect(store.snapshot().packagings).toEqual([{ ...CAJA, active: false, writtenBy: null }]);
  });

  it("only flips the active state and bumps the version, recording the writer", async () => {
    const store = new FakePurchasingStore();
    store.seedPackaging({ ...CAJA, id: "decoy", name: "Decoy" });
    store.seedPackaging(CAJA);

    const outcome = await deactivatePackaging(store, { id: "k-1", actorId: ACTOR });

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(store.snapshot().packagings).toEqual([
      expect.objectContaining({ id: "decoy", active: true, version: 3, writtenBy: null }),
      { ...CAJA, active: false, version: 4, writtenBy: ACTOR },
    ]);
    expect(store.lockCallOrder).toEqual(["lockPackaging"]);
  });
});
