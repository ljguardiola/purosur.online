import { describe, expect, it } from "vitest";
import { settleAbandonedSupplierPriceListReadings } from "./settle-abandoned-supplier-price-list-readings.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";
import { FakeSupplierPriceListReadings } from "./test-support/fake-supplier-price-list-readings.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const THIRTY_MINUTES_AGO = new Date("2026-03-10T14:30:00Z");
const ONE_MINUTE_AGO = new Date("2026-03-10T14:59:00Z");

function setup(
  lists: Parameters<FakeSupplierPriceListStore["seedList"]>[0][],
  readings: FakeSupplierPriceListReadings,
) {
  const store = new FakeSupplierPriceListStore();
  for (const list of lists) {
    store.seedList(list);
  }
  return { store, ports: { store, readings } };
}

function failingFirstTransactions(
  store: FakeSupplierPriceListStore,
  failures: Error[],
): SupplierPriceListStore {
  let transactions = 0;
  return {
    transaction(work) {
      const failure = failures[transactions];
      transactions += 1;
      return failure === undefined ? store.transaction(work) : Promise.reject(failure);
    },
  };
}

const THREE_ABANDONED_READINGS = [
  { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
  { listId: "list-2", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
  { listId: "list-3", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
];

const THREE_SENT_LISTS = THREE_ABANDONED_READINGS.map(({ listId }) => ({
  id: listId,
  sentAt: THIRTY_MINUTES_AGO,
  sentOn: "2026-03-10",
}));

describe("settleAbandonedSupplierPriceListReadings", () => {
  it("fails as interrupted a list sent to the AI service twenty-five minutes ago or more with no answer", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", sentAt: THIRTY_MINUTES_AGO, sentOn: "2026-03-10" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: ["list-1"],
    });
    expect(store.snapshot().lists[0]).toMatchObject({
      state: "READ_FAILED",
      readFailure: "interrupted",
    });
  });

  it("fails as unavailable a list whose reading started twenty-five minutes ago or more without sending it", async () => {
    const { store, ports } = setup(
      [{ id: "list-1" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: null, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: ["list-1"],
    });
    expect(store.snapshot().lists[0]).toMatchObject({
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
    });
  });

  it("leaves a list still waiting for its reading to start, however long ago it was uploaded", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", uploadedAt: new Date("2026-03-01T12:00:00Z") }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: null, readingStartedAt: null },
      ]),
    );
    const before = store.snapshot();

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: [],
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a reading that is still within its time", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", sentAt: ONE_MINUTE_AGO, sentOn: "2026-03-10" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: ONE_MINUTE_AGO, readingStartedAt: ONE_MINUTE_AGO },
      ]),
    );
    const before = store.snapshot();

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: [],
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a list whose reading finished after it was listed", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", state: "EXTRACTED", sentAt: THIRTY_MINUTES_AGO, sentOn: "2026-03-10" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );
    const before = store.snapshot();

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: [],
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a list that was sent to the AI service just after it was listed as unsent", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", sentAt: ONE_MINUTE_AGO, sentOn: "2026-03-10" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: null, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );
    const before = store.snapshot();

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: [],
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a list that was removed after it was listed", async () => {
    const { store, ports } = setup(
      [],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: [],
    });
    expect(store.snapshot().lists).toEqual([]);
  });

  it("settles each abandoned list in its own transaction, leaving the others", async () => {
    const { store, ports } = setup(
      [
        { id: "list-1", sentAt: THIRTY_MINUTES_AGO, sentOn: "2026-03-10" },
        { id: "list-2", sentAt: ONE_MINUTE_AGO, sentOn: "2026-03-10" },
        { id: "list-3" },
      ],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
        { listId: "list-2", sentAt: ONE_MINUTE_AGO, readingStartedAt: ONE_MINUTE_AGO },
        { listId: "list-3", sentAt: null, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );

    expect(await settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).toEqual({
      kind: "settled",
      listIds: ["list-1", "list-3"],
    });
    expect(store.transactionCount).toBe(2);
    expect(store.snapshot().lists.map((list) => [list.id, list.state])).toEqual([
      ["list-1", "READ_FAILED"],
      ["list-2", "READING"],
      ["list-3", "READ_FAILED"],
    ]);
  });

  it("leaves the list reading when recording its failure fails", async () => {
    const { store, ports } = setup(
      [{ id: "list-1", sentAt: THIRTY_MINUTES_AGO, sentOn: "2026-03-10" }],
      new FakeSupplierPriceListReadings([
        { listId: "list-1", sentAt: THIRTY_MINUTES_AGO, readingStartedAt: THIRTY_MINUTES_AGO },
      ]),
    );
    store.failingWrites.add("recordReadFailure");

    await expect(settleAbandonedSupplierPriceListReadings(ports, { now: NOW })).rejects.toThrow(
      "recordReadFailure failed",
    );
    expect(store.snapshot().lists[0]).toMatchObject({ state: "READING", readFailure: null });
  });

  it("settles every other abandoned list when settling one fails, then reports that failure", async () => {
    const { store, ports } = setup(
      THREE_SENT_LISTS,
      new FakeSupplierPriceListReadings(THREE_ABANDONED_READINGS),
    );
    const failure = new Error("connection lost");

    await expect(
      settleAbandonedSupplierPriceListReadings(
        { ...ports, store: failingFirstTransactions(store, [failure]) },
        { now: NOW },
      ),
    ).rejects.toBe(failure);
    expect(store.snapshot().lists.map((list) => [list.id, list.state])).toEqual([
      ["list-1", "READING"],
      ["list-2", "READ_FAILED"],
      ["list-3", "READ_FAILED"],
    ]);
  });

  it("reports every failure together when settling several abandoned lists fails", async () => {
    const { store, ports } = setup(
      THREE_SENT_LISTS,
      new FakeSupplierPriceListReadings(THREE_ABANDONED_READINGS),
    );
    const failures = [new Error("connection lost"), new Error("deadlock detected")];

    const settling = settleAbandonedSupplierPriceListReadings(
      { ...ports, store: failingFirstTransactions(store, failures) },
      { now: NOW },
    );

    await expect(settling).rejects.toBeInstanceOf(AggregateError);
    await expect(settling).rejects.toMatchObject({
      message: "Settling 2 abandoned supplier price list readings failed",
      errors: failures,
    });
    expect(store.snapshot().lists.map((list) => [list.id, list.state])).toEqual([
      ["list-1", "READING"],
      ["list-2", "READING"],
      ["list-3", "READ_FAILED"],
    ]);
  });
});

describe("settleAbandonedSupplierPriceListReadings of rereads", () => {
  function setupReread(reread: Parameters<FakeSupplierPriceListStore["seedReread"]>[0]) {
    const store = new FakeSupplierPriceListStore();
    store.seedList({ id: "list-1", state: "EXTRACTED", version: 4, sentOn: "2026-03-01" });
    store.seedReread(reread);
    return store;
  }

  it("fails as interrupted a reread sent to the AI service twenty-five minutes ago or more with no answer, leaving the list as it was", async () => {
    const store = setupReread({
      id: "reread-1",
      listId: "list-1",
      sentAt: THIRTY_MINUTES_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: THIRTY_MINUTES_AGO,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);
    const listBefore = store.snapshot().lists;

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: ["list-1"] });

    expect(store.snapshot().rereads[0]).toMatchObject({
      state: "READ_FAILED",
      readFailure: "interrupted",
    });
    expect(store.snapshot().lists).toEqual(listBefore);
  });

  it("fails as unavailable a reread whose reading started twenty-five minutes ago or more without sending it", async () => {
    const store = setupReread({ id: "reread-1", listId: "list-1" });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: null,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);

    await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW });

    expect(store.snapshot().rereads[0]).toMatchObject({
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
    });
  });

  it("leaves a reread still waiting for its reading to start and one still within its time", async () => {
    const store = setupReread({ id: "reread-1", listId: "list-1" });
    store.seedList({ id: "list-2", state: "EXTRACTED" });
    store.seedReread({
      id: "reread-2",
      listId: "list-2",
      sentAt: ONE_MINUTE_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      { listId: "list-1", rereadId: "reread-1", sentAt: null, readingStartedAt: null },
      {
        listId: "list-2",
        rereadId: "reread-2",
        sentAt: ONE_MINUTE_AGO,
        readingStartedAt: ONE_MINUTE_AGO,
      },
    ]);
    const before = store.snapshot();

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: [] });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a reread that finished after it was listed", async () => {
    const store = setupReread({
      id: "reread-1",
      listId: "list-1",
      state: "READ",
      sentAt: THIRTY_MINUTES_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: THIRTY_MINUTES_AGO,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);
    const before = store.snapshot();

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: [] });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a newer reread of the list that took the place of the one listed", async () => {
    const store = setupReread({
      id: "reread-1",
      listId: "list-1",
      state: "READ_FAILED",
      readFailure: "interrupted",
      sentAt: THIRTY_MINUTES_AGO,
      sentOn: "2026-03-10",
    });
    store.seedReread({
      id: "reread-2",
      listId: "list-1",
      sentAt: ONE_MINUTE_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: THIRTY_MINUTES_AGO,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);
    const before = store.snapshot();

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: [] });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a reread that was sent just after it was listed as unsent", async () => {
    const store = setupReread({
      id: "reread-1",
      listId: "list-1",
      sentAt: ONE_MINUTE_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: null,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);
    const before = store.snapshot();

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: [] });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves a reread of a list that was removed after it was listed", async () => {
    const store = new FakeSupplierPriceListStore();
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: THIRTY_MINUTES_AGO,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);

    expect(
      await settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).toEqual({ kind: "settled", listIds: [] });
  });

  it("leaves the reread open when recording its failure fails", async () => {
    const store = setupReread({
      id: "reread-1",
      listId: "list-1",
      sentAt: THIRTY_MINUTES_AGO,
      sentOn: "2026-03-10",
    });
    const readings = new FakeSupplierPriceListReadings([
      {
        listId: "list-1",
        rereadId: "reread-1",
        sentAt: THIRTY_MINUTES_AGO,
        readingStartedAt: THIRTY_MINUTES_AGO,
      },
    ]);
    store.failingWrites.add("recordRereadFailure");

    await expect(
      settleAbandonedSupplierPriceListReadings({ store, readings }, { now: NOW }),
    ).rejects.toThrow("recordRereadFailure failed");
    expect(store.snapshot().rereads[0]).toMatchObject({ state: "READING", readFailure: null });
  });
});
