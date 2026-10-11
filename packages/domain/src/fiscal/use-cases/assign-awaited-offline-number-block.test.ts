import { describe, expect, it } from "vitest";
import { assignAwaitedOfflineNumberBlock } from "./assign-awaited-offline-number-block.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";

function storeWithOfflineRegister(): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  store.seedRegister({ id: "register-1", locationId: "branch-1", name: "Caja 1" });
  store.seedRegisterOfflinePointOfSale({
    registerId: "register-1",
    pointOfSaleNumber: 12,
    version: 1,
  });
  return store;
}

function assignAwaited(store: FakeRegisterPointOfSaleStore) {
  return assignAwaitedOfflineNumberBlock(store.offline, { pointOfSaleNumber: 12 });
}

describe("assignAwaitedOfflineNumberBlock", () => {
  it("assigns the offline register the first block of its point of sale, right after the tax authority's count", async () => {
    const store = storeWithOfflineRegister();
    store.seedTaxAuthorityCount(12, 37);

    const outcome = await assignAwaited(store);

    expect(outcome).toEqual({ kind: "assigned", range: { firstNumber: 38, lastNumber: 1037 } });
    expect(store.snapshot().offlineNumberBlocks).toEqual([
      {
        pointOfSaleNumber: 12,
        documentType: "factura_c",
        registerId: "register-1",
        range: { firstNumber: 38, lastNumber: 1037 },
        status: "in_use",
      },
    ]);
  });

  it("assigns nothing when no register has that point of sale as its offline one", async () => {
    const store = new FakeRegisterPointOfSaleStore();
    store.seedTaxAuthorityCount(12, 37);

    const outcome = await assignAwaited(store);

    expect(outcome).toEqual({ kind: "no_offline_register" });
    expect(store.snapshot().offlineNumberBlocks).toEqual([]);
  });

  it("assigns one block when it runs twice", async () => {
    const store = storeWithOfflineRegister();
    store.seedTaxAuthorityCount(12, 37);

    const first = await assignAwaited(store);
    const second = await assignAwaited(store);

    expect(first.kind).toBe("assigned");
    expect(second).toEqual({ kind: "already_has_block" });
    expect(store.snapshot().offlineNumberBlocks).toHaveLength(1);
  });

  it("assigns nothing when the configuration already assigned the block", async () => {
    const store = storeWithOfflineRegister();
    store.seedTaxAuthorityCount(12, 37);
    store.seedOfflineNumberBlock({
      pointOfSaleNumber: 12,
      documentType: "factura_c",
      registerId: "register-1",
      range: { firstNumber: 38, lastNumber: 1037 },
      status: "in_use",
    });
    const before = store.snapshot();

    const outcome = await assignAwaited(store);

    expect(outcome).toEqual({ kind: "already_has_block" });
    expect(store.snapshot()).toEqual(before);
  });

  it("assigns nothing while the tax authority's count is still unknown", async () => {
    const store = storeWithOfflineRegister();

    const outcome = await assignAwaited(store);

    expect(outcome).toEqual({ kind: "tax_authority_count_unknown" });
    expect(store.snapshot().offlineNumberBlocks).toEqual([]);
  });

  it("locks the series before it reads anything, in one transaction", async () => {
    const store = storeWithOfflineRegister();
    store.seedTaxAuthorityCount(12, 37);

    await assignAwaited(store);

    expect(store.operationOrder).toEqual([
      "lockOfflineNumberBlocks",
      "offlineRegisterOf",
      "hasOfflineNumberBlock",
      "taxAuthorityLastAuthorized",
      "recordOfflineNumberBlock",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
