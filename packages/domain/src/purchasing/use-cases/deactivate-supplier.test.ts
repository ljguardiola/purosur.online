import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { deactivateSupplier } from "./deactivate-supplier.js";
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

describe("deactivateSupplier", () => {
  it("answers not_found for a missing supplier", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    expect(await deactivateSupplier(store, { id: "missing", actorId: ACTOR })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("answers already_inactive for a deactivated supplier, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({ ...NORTE, active: false });

    expect(await deactivateSupplier(store, { id: "s-1", actorId: ACTOR })).toEqual({
      kind: "already_inactive",
    });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, active: false, writtenBy: null }]);
  });

  it("only flips the active state and bumps the version, recording the writer", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({ ...NORTE, id: "decoy", name: "Decoy", cuit: null });
    store.seedSupplier(NORTE);
    store.supplierNameConflicts.add("distribuidora norte");
    store.supplierCuitConflicts.add(FICTIONAL_CUIT);

    const outcome = await deactivateSupplier(store, { id: "s-1", actorId: ACTOR });

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(store.snapshot().suppliers).toEqual([
      expect.objectContaining({ id: "decoy", active: true, version: 3, writtenBy: null }),
      { ...NORTE, active: false, version: 4, writtenBy: ACTOR },
    ]);
    expect(store.lockCallOrder).toEqual(["lockSupplier"]);
  });
});
