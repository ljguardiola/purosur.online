import { describe, expect, it, vi } from "vitest";
import { createFiscalAddress } from "./create-fiscal-address.js";
import { FakeFiscalAddressStore } from "./test-support/fake-fiscal-address-store.js";

const input = {
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  actorId: "actor-1",
};

describe("createFiscalAddress", () => {
  it("creates the fiscal address at version 1 and records who created it", async () => {
    const store = new FakeFiscalAddressStore();

    const outcome = await createFiscalAddress({ store }, input);

    const created = {
      id: "fiscal-address-1",
      name: "Depósito Central",
      streetAddress: "Calle Ficticia 123, CABA",
      version: 1,
    };
    expect(outcome).toEqual({ kind: "created", fiscalAddress: created });
    expect(store.snapshot().fiscalAddresses).toEqual([{ ...created, recordedBy: "actor-1" }]);
  });

  it("gives each created fiscal address its own id", async () => {
    const store = new FakeFiscalAddressStore();

    const first = await createFiscalAddress({ store }, input);
    const second = await createFiscalAddress({ store }, { ...input, name: "Local Norte" });

    expect(
      [first, second].map((outcome) => outcome.kind === "created" && outcome.fiscalAddress.id),
    ).toEqual(["fiscal-address-1", "fiscal-address-2"]);
  });

  it("refuses a name another fiscal address has, whatever its letter case, writing nothing", async () => {
    const store = new FakeFiscalAddressStore();
    store.seed({ id: "existing", name: "Depósito Central", streetAddress: "Otra 1", version: 1 });
    const before = store.snapshot();

    const outcome = await createFiscalAddress({ store }, { ...input, name: "DEPÓSITO CENTRAL" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("lets a street address already used by another fiscal address be used again", async () => {
    const store = new FakeFiscalAddressStore();
    store.seed({
      id: "existing",
      name: "Local Norte",
      streetAddress: input.streetAddress,
      version: 1,
    });

    const outcome = await createFiscalAddress({ store }, input);

    expect(outcome.kind).toBe("created");
  });

  it("answers name_taken when it loses the name to a concurrent create, leaving nothing behind", async () => {
    const store = new FakeFiscalAddressStore();
    store.nameConflicts.add("depósito central");

    const outcome = await createFiscalAddress({ store }, input);

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().fiscalAddresses).toEqual([]);
  });

  it("lets an error that is not a lost name race through", async () => {
    const store = new FakeFiscalAddressStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(createFiscalAddress({ store }, input)).rejects.toThrow("connection lost");
  });

  it("checks the names, then inserts, in one transaction", async () => {
    const store = new FakeFiscalAddressStore();

    await createFiscalAddress({ store }, input);

    expect(store.operationOrder).toEqual(["listFiscalAddresses", "insertFiscalAddress"]);
    expect(store.transactionCount).toBe(1);
  });
});
