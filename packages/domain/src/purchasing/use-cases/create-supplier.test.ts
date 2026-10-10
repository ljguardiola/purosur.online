import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { createSupplier } from "./create-supplier.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const ACTOR = "person-1";

describe("createSupplier", () => {
  it("creates an active supplier at version 1, recording who wrote it", async () => {
    const store = new FakePurchasingStore();

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: FICTIONAL_CUIT,
      contact: "ventas@example.com",
      note: "Entrega los martes",
      actorId: ACTOR,
    });

    const expected = {
      id: "supplier-1",
      name: "Distribuidora Norte",
      cuit: FICTIONAL_CUIT,
      contact: "ventas@example.com",
      note: "Entrega los martes",
      active: true,
      version: 1,
    };
    expect(outcome).toEqual({ kind: "created", supplier: expected });
    expect(store.snapshot().suppliers).toEqual([{ ...expected, writtenBy: ACTOR }]);
    expect(store.transactionCount).toBe(1);
  });

  it("creates a supplier with no tax id, contact or note", async () => {
    const store = new FakePurchasingStore();

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: null,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome).toMatchObject({
      kind: "created",
      supplier: { cuit: null, contact: null, note: null },
    });
  });

  it("refuses a name another supplier has, ignoring letter case and including inactive ones", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({
      id: "s-1",
      name: "Distribuidora Norte",
      cuit: null,
      contact: null,
      note: null,
      active: false,
      version: 3,
    });

    const outcome = await createSupplier(store, {
      name: "DISTRIBUIDORA norte",
      cuit: null,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().suppliers).toHaveLength(1);
  });

  it("refuses a tax id another supplier has, including an inactive one", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({
      id: "s-1",
      name: "Otra",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      active: false,
      version: 1,
    });

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "cuit_taken" });
    expect(store.snapshot().suppliers).toHaveLength(1);
  });

  it("lets several suppliers carry no tax id", async () => {
    const store = new FakePurchasingStore();
    store.seedSupplier({
      id: "s-1",
      name: "Otra",
      cuit: null,
      contact: null,
      note: null,
      active: true,
      version: 1,
    });

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: null,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("created");
  });

  it("answers name_taken when it loses the name to a concurrent write, leaving nothing behind", async () => {
    const store = new FakePurchasingStore();
    store.supplierNameConflicts.add("distribuidora norte");

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: ANOTHER_FICTIONAL_CUIT,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().suppliers).toEqual([]);
  });

  it("answers cuit_taken when it loses the tax id to a concurrent write, leaving nothing behind", async () => {
    const store = new FakePurchasingStore();
    store.supplierCuitConflicts.add(FICTIONAL_CUIT);

    const outcome = await createSupplier(store, {
      name: "Distribuidora Norte",
      cuit: FICTIONAL_CUIT,
      contact: null,
      note: null,
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "cuit_taken" });
    expect(store.snapshot().suppliers).toEqual([]);
  });

  it("does not hide an unexpected failure", async () => {
    const store = new FakePurchasingStore();
    store.transaction = async () => {
      throw new Error("connection lost");
    };

    await expect(
      createSupplier(store, { name: "A", cuit: null, contact: null, note: null, actorId: ACTOR }),
    ).rejects.toThrow("connection lost");
  });
});
