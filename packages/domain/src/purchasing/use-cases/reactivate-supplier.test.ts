import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { reactivateSupplier } from "./reactivate-supplier.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const ACTOR = "person-1";

const NORTE = {
  id: "s-1",
  name: "Distribuidora Norte",
  cuit: FICTIONAL_CUIT,
  contact: "ventas@example.com",
  note: "Entrega los martes",
  active: true,
  version: 3,
};

describe("reactivateSupplier", () => {
  it("answers not_found for a missing supplier", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    expect(await reactivateSupplier(store, { id: "missing", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("answers already_active for an active supplier, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    expect(await reactivateSupplier(store, { id: "s-1", actorId: ACTOR })).toEqual({
      kind: "already_active",
    });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("only flips the active state back and bumps the version, recording the writer", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({ ...NORTE, id: "decoy", name: "Decoy", cuit: null, active: false });
    store.seedSupplier({ ...NORTE, active: false });
    store.supplierNameConflicts.add("distribuidora norte");
    store.supplierCuitConflicts.add(FICTIONAL_CUIT);

    const outcome = await reactivateSupplier(store, { id: "s-1", actorId: ACTOR });

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().suppliers).toEqual([
      expect.objectContaining({ id: "decoy", active: false, version: 3, writtenBy: null }),
      { ...NORTE, active: true, version: 4, writtenBy: ACTOR },
    ]);
    expect(store.lockCallOrder).toEqual(["lockSupplier"]);
  });
});
