import { describe, expect, it } from "vitest";
import { assignNextOfflineNumberBlocks } from "./assign-next-offline-number-blocks.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";

const FIRST_RANGE = { firstNumber: 1, lastNumber: 1000 };
const NEXT_RANGE = { firstNumber: 1001, lastNumber: 2000 };

function storeWithUsedUpBlocksOn(...pointOfSaleNumbers: number[]): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  for (const pointOfSaleNumber of pointOfSaleNumbers) {
    const registerId = `register-of-${pointOfSaleNumber}`;
    store.seedRegister({
      id: registerId,
      locationId: "branch-1",
      name: `Caja ${pointOfSaleNumber}`,
    });
    store.seedRegisterOfflinePointOfSale({ registerId, pointOfSaleNumber, version: 1 });
    store.seedOfflineNumberBlock({
      pointOfSaleNumber,
      documentType: "factura_c",
      registerId,
      range: FIRST_RANGE,
      status: "in_use",
    });
    store.seedHighestSyncedOfflineNumber(pointOfSaleNumber, FIRST_RANGE.lastNumber);
  }
  return store;
}

function seriesOf(pointOfSaleNumber: number) {
  return { pointOfSaleNumber, documentType: "factura_c" } as const;
}

describe("assignNextOfflineNumberBlocks", () => {
  it("locks each series once, in the order of its point of sale, whatever order the series are named in", async () => {
    const store = storeWithUsedUpBlocksOn(12, 13);

    await store.offline.transaction((tx) =>
      assignNextOfflineNumberBlocks(tx, [seriesOf(13), seriesOf(12), seriesOf(13)]),
    );

    expect(store.offlineNumberBlockLocks).toEqual([seriesOf(12), seriesOf(13)]);
  });

  it("assigns the next block of every series whose block was used up, answering each series' outcome in lock order", async () => {
    const store = storeWithUsedUpBlocksOn(12, 13);

    const outcomes = await store.offline.transaction((tx) =>
      assignNextOfflineNumberBlocks(tx, [seriesOf(13), seriesOf(12)]),
    );

    expect(outcomes).toEqual([
      { series: seriesOf(12), outcome: { kind: "assigned", range: NEXT_RANGE } },
      { series: seriesOf(13), outcome: { kind: "assigned", range: NEXT_RANGE } },
    ]);
    expect(
      store
        .snapshot()
        .offlineNumberBlocks.filter((block) => block.status === "in_use")
        .map((block) => [block.pointOfSaleNumber, block.range]),
    ).toEqual([
      [12, NEXT_RANGE],
      [13, NEXT_RANGE],
    ]);
  });

  it("locks nothing when no series is named", async () => {
    const store = storeWithUsedUpBlocksOn(12);

    const outcomes = await store.offline.transaction((tx) => assignNextOfflineNumberBlocks(tx, []));

    expect(outcomes).toEqual([]);
    expect(store.offlineNumberBlockLocks).toEqual([]);
  });
});
