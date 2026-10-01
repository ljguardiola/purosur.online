import { describe, expect, it, vi } from "vitest";
import { editFiscalAddress } from "./edit-fiscal-address.js";
import { FakeFiscalAddressStore } from "./test-support/fake-fiscal-address-store.js";

const central = {
  id: "address-1",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 3,
};
const north = {
  id: "address-2",
  name: "Local Norte",
  streetAddress: "Avenida Inventada 45",
  version: 1,
};

function seeded() {
  const store = new FakeFiscalAddressStore();
  store.seed(central);
  store.seed(north);
  return store;
}

function edit(store: FakeFiscalAddressStore, overrides: Record<string, unknown> = {}) {
  return editFiscalAddress(
    { store },
    {
      fiscalAddressId: "address-1",
      name: "Depósito Principal",
      streetAddress: "Calle Ficticia 123, CABA",
      version: 3,
      actorId: "actor-1",
      ...overrides,
    },
  );
}

describe("editFiscalAddress", () => {
  it("saves the new values as the next version and records who edited it", async () => {
    const store = seeded();

    const outcome = await edit(store, { streetAddress: "Calle Inventada 9" });

    const edited = {
      ...central,
      name: "Depósito Principal",
      streetAddress: "Calle Inventada 9",
      version: 4,
    };
    expect(outcome).toEqual({ kind: "edited", fiscalAddress: edited });
    expect(store.snapshot().fiscalAddresses).toEqual([
      { ...edited, recordedBy: "actor-1" },
      { ...north, recordedBy: null },
    ]);
  });

  it("saves a new street address under the name it already has", async () => {
    const store = seeded();

    const outcome = await edit(store, {
      name: "Depósito Central",
      streetAddress: "Calle Inventada 9",
    });

    expect(outcome).toEqual({
      kind: "edited",
      fiscalAddress: { ...central, streetAddress: "Calle Inventada 9", version: 4 },
    });
  });

  it("refuses a fiscal address that does not exist", async () => {
    const store = seeded();
    const before = store.snapshot();

    const outcome = await edit(store, { fiscalAddressId: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses an edit made from another version, writing nothing", async () => {
    const store = seeded();
    const before = store.snapshot();

    const outcome = await edit(store, { version: 2 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockFiscalAddress"]);
  });

  it("refuses a name another fiscal address has, whatever its letter case, writing nothing", async () => {
    const store = seeded();
    const before = store.snapshot();

    const outcome = await edit(store, { name: "LOCAL NORTE" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a name one of several other fiscal addresses has", async () => {
    const store = seeded();
    store.seed({
      id: "address-3",
      name: "Sucursal Sur",
      streetAddress: "Pasaje Ficticio 7",
      version: 1,
    });

    const outcome = await edit(store, { name: "sucursal sur" });

    expect(outcome).toEqual({ kind: "name_taken" });
  });

  it("lets a fiscal address change only the letter case of its own name", async () => {
    const store = seeded();

    const outcome = await edit(store, { name: "DEPÓSITO CENTRAL" });

    expect(outcome).toEqual({
      kind: "edited",
      fiscalAddress: { ...central, name: "DEPÓSITO CENTRAL", version: 4 },
    });
  });

  it("records nothing when both values are the ones already saved", async () => {
    const store = seeded();
    const before = store.snapshot();

    const outcome = await edit(store, { name: "Depósito Central" });

    expect(outcome).toEqual({ kind: "unchanged", fiscalAddress: central });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockFiscalAddress"]);
  });

  it("answers name_taken when it loses the name to a concurrent write, leaving nothing behind", async () => {
    const store = seeded();
    store.nameConflicts.add("depósito principal");
    const before = store.snapshot();

    const outcome = await edit(store);

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("lets an error that is not a lost name race through", async () => {
    const store = seeded();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(edit(store)).rejects.toThrow("connection lost");
  });

  it("locks the fiscal address, checks the names, then writes, in one transaction", async () => {
    const store = seeded();

    await edit(store);

    expect(store.operationOrder).toEqual([
      "lockFiscalAddress",
      "listFiscalAddresses",
      "updateFiscalAddress",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
