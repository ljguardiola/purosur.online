import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { editSupplier } from "./edit-supplier.js";
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

const SAME_FIELDS = {
  name: NORTE.name,
  cuit: NORTE.cuit,
  contact: NORTE.contact,
  note: NORTE.note,
};

describe("editSupplier", () => {
  it("answers not_found for a supplier missing when it is locked, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    const outcome = await editSupplier(store, {
      id: "missing",
      ...SAME_FIELDS,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("rejects a stale version", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      name: "Nuevo",
      version: 2,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("changes every field, bumping the version, keeping the active state and recording the writer", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({ ...NORTE, id: "decoy", name: "Decoy", cuit: null, version: 7 });
    store.seedSupplier({ ...NORTE, active: false });

    const outcome = await editSupplier(store, {
      id: "s-1",
      name: "Distribuidora Sur",
      cuit: ANOTHER_FICTIONAL_CUIT,
      contact: null,
      note: "Otra nota",
      version: 3,
      actorId: ACTOR,
    });

    const expected = {
      id: "s-1",
      name: "Distribuidora Sur",
      cuit: ANOTHER_FICTIONAL_CUIT,
      contact: null,
      note: "Otra nota",
      active: false,
      version: 4,
    };
    expect(outcome).toEqual({ kind: "applied", supplier: expected });
    expect(store.snapshot().suppliers).toEqual([
      expect.objectContaining({ id: "decoy", version: 7, writtenBy: null }),
      { ...expected, writtenBy: ACTOR },
    ]);
    expect(store.lockCallOrder).toEqual(["lockSupplier"]);
    expect(store.transactionCount).toBe(1);
  });

  it("keeps an unchanged supplier as a no-op that bumps nothing and writes nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);
    store.supplierNameConflicts.add("distribuidora norte");
    store.supplierCuitConflicts.add(FICTIONAL_CUIT);

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "applied", supplier: NORTE });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it.each([
    ["contact", { contact: "otro@example.com" }],
    ["note", { note: null }],
    ["cuit", { cuit: null }],
    ["name letter case", { name: "DISTRIBUIDORA NORTE" }],
  ])("applies a change of only the %s", async (_field, change) => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      ...change,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "applied", supplier: { ...NORTE, ...change, version: 4 } });
  });

  it("refuses a name another supplier has, ignoring letter case and including inactive ones", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);
    store.seedSupplier({ ...NORTE, id: "s-2", name: "Sur", cuit: null, active: false });

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      name: "SUR",
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("refuses a tax id another supplier has", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);
    store.seedSupplier({
      ...NORTE,
      id: "s-2",
      name: "Sur",
      cuit: ANOTHER_FICTIONAL_CUIT,
      active: false,
    });

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      cuit: ANOTHER_FICTIONAL_CUIT,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "cuit_taken" });
    expect(store.snapshot().suppliers[0]).toMatchObject({ cuit: FICTIONAL_CUIT, version: 3 });
  });

  it("does not count the supplier itself as holding its own name or tax id", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      contact: "otro@example.com",
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("applied");
  });

  it("answers name_taken when it loses the name to a concurrent write, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);
    store.supplierNameConflicts.add("distribuidora sur");

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      name: "Distribuidora Sur",
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("answers cuit_taken when it loses the tax id to a concurrent write, changing nothing", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier(NORTE);
    store.supplierCuitConflicts.add(ANOTHER_FICTIONAL_CUIT);

    const outcome = await editSupplier(store, {
      id: "s-1",
      ...SAME_FIELDS,
      cuit: ANOTHER_FICTIONAL_CUIT,
      version: 3,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "cuit_taken" });
    expect(store.snapshot().suppliers).toEqual([{ ...NORTE, writtenBy: null }]);
  });

  it("does not hide an unexpected failure", async () => {
    const store = new FakePurchasingStore();
    store.transaction = async () => {
      throw new Error("connection lost");
    };

    await expect(
      editSupplier(store, { id: "s-1", ...SAME_FIELDS, version: 3, actorId: ACTOR }),
    ).rejects.toThrow("connection lost");
  });
});
