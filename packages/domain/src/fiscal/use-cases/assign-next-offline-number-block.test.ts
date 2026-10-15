import { describe, expect, it } from "vitest";
import { assignNextOfflineNumberBlock } from "./assign-next-offline-number-block.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";

const series = { pointOfSaleNumber: 12, documentType: "factura_c" } as const;
const CURRENT_BLOCK = {
  ...series,
  registerId: "register-1",
  range: { firstNumber: 38, lastNumber: 1037 },
  status: "in_use",
} as const;

function storeWithBlock(highestSynced: number | null): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  store.seedRegister({ id: "register-1", locationId: "branch-1", name: "Caja 1" });
  store.seedRegisterOfflinePointOfSale({
    registerId: "register-1",
    pointOfSaleNumber: 12,
    version: 1,
  });
  store.seedOfflineNumberBlock(CURRENT_BLOCK);
  if (highestSynced !== null) {
    store.seedHighestSyncedOfflineNumber(12, highestSynced);
  }
  return store;
}

function assignNext(store: FakeRegisterPointOfSaleStore) {
  return store.offline.transaction((tx) => assignNextOfflineNumberBlock(tx, series));
}

describe("assignNextOfflineNumberBlock", () => {
  it("assigns the next contiguous block to the offline register once the synced documents used up the current one", async () => {
    const store = storeWithBlock(1037);

    const outcome = await assignNext(store);

    expect(outcome).toEqual({
      kind: "assigned",
      range: { firstNumber: 1038, lastNumber: 2037 },
    });
    expect(store.snapshot().offlineNumberBlocks).toEqual([
      { ...CURRENT_BLOCK, status: "used_up" },
      { ...CURRENT_BLOCK, range: { firstNumber: 1038, lastNumber: 2037 }, status: "in_use" },
    ]);
  });

  it("assigns the next block when the synced documents went past the current one", async () => {
    const store = storeWithBlock(1100);

    const outcome = await assignNext(store);

    expect(outcome).toEqual({
      kind: "assigned",
      range: { firstNumber: 1038, lastNumber: 2037 },
    });
  });

  it("assigns the block to the register that holds the offline point of sale", async () => {
    const store = storeWithBlock(1037);
    store.seedRegister({ id: "register-2", locationId: "branch-1", name: "Caja 2" });

    await assignNext(store);

    expect(store.snapshot().offlineNumberBlocks.at(-1)?.registerId).toBe("register-1");
  });

  it("assigns nothing while the current block still has numbers the synced documents did not use", async () => {
    const store = storeWithBlock(1036);
    const before = store.snapshot().offlineNumberBlocks;

    const outcome = await assignNext(store);

    expect(outcome).toEqual({ kind: "block_not_used_up" });
    expect(store.snapshot().offlineNumberBlocks).toEqual(before);
  });

  it("assigns nothing while no document was synced", async () => {
    const outcome = await assignNext(storeWithBlock(null));

    expect(outcome).toEqual({ kind: "block_not_used_up" });
  });

  it("assigns nothing when the series has no block in use", async () => {
    const store = new FakeRegisterPointOfSaleStore();
    store.seedOfflineNumberBlock({ ...CURRENT_BLOCK, status: "used_up" });
    store.seedHighestSyncedOfflineNumber(12, 5000);

    const outcome = await assignNext(store);

    expect(outcome).toEqual({ kind: "no_block_in_use" });
    expect(store.snapshot().offlineNumberBlocks).toHaveLength(1);
  });

  it("assigns nothing when no register holds the offline point of sale", async () => {
    const store = new FakeRegisterPointOfSaleStore();
    store.seedOfflineNumberBlock(CURRENT_BLOCK);
    store.seedHighestSyncedOfflineNumber(12, 1037);

    const outcome = await assignNext(store);

    expect(outcome).toEqual({ kind: "no_offline_register" });
    expect(store.snapshot().offlineNumberBlocks).toEqual([CURRENT_BLOCK]);
  });

  it("ignores the blocks of another point of sale", async () => {
    const store = storeWithBlock(1037);
    store.seedOfflineNumberBlock({ ...CURRENT_BLOCK, pointOfSaleNumber: 13 });

    await assignNext(store);

    expect(
      store.snapshot().offlineNumberBlocks.filter((block) => block.pointOfSaleNumber === 13),
    ).toEqual([{ ...CURRENT_BLOCK, pointOfSaleNumber: 13 }]);
  });

  it("locks the series before it reads anything", async () => {
    const store = storeWithBlock(1037);

    await assignNext(store);

    expect(store.operationOrder).toEqual([
      "lockOfflineNumberBlocks",
      "offlineNumberBlockInUse",
      "highestSyncedOfflineNumber",
      "offlineRegisterOf",
      "markOfflineNumberBlockUsedUp",
      "recordOfflineNumberBlock",
    ]);
  });

  it("never holds more than one block in use, even when it runs twice", async () => {
    const store = storeWithBlock(1037);

    const first = await assignNext(store);
    const second = await assignNext(store);

    expect(first.kind).toBe("assigned");
    expect(second).toEqual({ kind: "block_not_used_up" });
    expect(
      store.snapshot().offlineNumberBlocks.filter((block) => block.status === "in_use"),
    ).toHaveLength(1);
  });

  it("leaves the series untouched when recording the next block fails", async () => {
    const store = storeWithBlock(1037);
    store.failingWrites.add("recordOfflineNumberBlock");
    const before = store.snapshot().offlineNumberBlocks;

    await expect(assignNext(store)).rejects.toThrow("recordOfflineNumberBlock failed");

    expect(store.snapshot().offlineNumberBlocks).toEqual(before);
  });
});
