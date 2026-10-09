import { describe, expect, it } from "vitest";
import { flushRejectedAttempts } from "./flush-rejected-attempts.js";
import type { RejectedAttemptWindow } from "./rejected-attempt-flush-store.js";
import { FakeRejectedAttemptFlushStore } from "./test-support/fake-rejected-attempt-flush-store.js";

const CLOSED_BEFORE = new Date("2026-01-05T12:50:00.000Z");
const WINDOW = new Date("2026-01-05T12:00:00.000Z");
const AT = (minutes: number) => new Date(WINDOW.getTime() + minutes * 60_000);

function window(overrides: Partial<RejectedAttemptWindow> = {}): RejectedAttemptWindow {
  return {
    kind: "redeem",
    keyHash: "token-1",
    windowStart: WINDOW,
    count: 1,
    firstAt: AT(5),
    lastAt: AT(5),
    ...overrides,
  };
}

function fixture() {
  const store = new FakeRejectedAttemptFlushStore();
  store.accountsByDestination.set("dest-ada", "u-ada");
  store.accountsByToken.set("token-1", "u-ada");
  store.accountsByToken.set("token-2", "u-ada");
  store.accountsByToken.set("token-grace", "u-grace");
  const flush = (batchSize = 500) =>
    flushRejectedAttempts({ store }, { closedBefore: CLOSED_BEFORE, batchSize });
  return { store, flush };
}

describe("flushRejectedAttempts", () => {
  it("flushes nothing and writes nothing when no window has closed", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ windowStart: new Date(CLOSED_BEFORE.getTime() + 1) }));
    const before = store.snapshot();

    expect(await flush()).toBe(0);

    expect(store.snapshot()).toEqual(before);
  });

  it("locks the flush, takes the windows, resolves the accounts and records, in that order", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada" }));
    store.seedWindow(window());

    await flush();

    expect(store.operationOrder.slice(0, 7)).toEqual([
      "lockFlush",
      "takeClosedWindows",
      "accountsByDestinationHash",
      "accountsByTokenHash",
      "takeClosedTokenWindowsOf",
      "accountsByTokenHash",
      "recordFlushedAttempts",
    ]);
  });

  it("resolves a request window by its destination hash and a token window by its token hash", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada", count: 2 }));
    store.seedWindow(window({ kind: "redeem", keyHash: "token-grace", count: 3 }));

    expect(await flush()).toBe(2);

    expect(store.snapshot().flushed).toEqual([
      { accountId: "u-ada", kind: "request", count: 2, firstAt: AT(5), lastAt: AT(5) },
      { accountId: "u-grace", kind: "redeem", count: 3, firstAt: AT(5), lastAt: AT(5) },
    ]);
    expect(store.snapshot().windows).toEqual([]);
  });

  it("looks the request windows up by destination hash and the others by token hash, nothing else", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada" }));
    store.seedWindow(window({ kind: "redeem", keyHash: "token-grace" }));
    store.seedWindow(window({ kind: "registration_options", keyHash: "token-1" }));

    await flush();

    expect(store.destinationLookups[0]).toEqual(["dest-ada"]);
    expect(store.tokenLookups[0]).toEqual(["token-grace", "token-1"]);
  });

  it("does not resolve a request window through a token hash or the reverse", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "token-1" }));
    store.seedWindow(window({ kind: "redeem", keyHash: "dest-ada" }));

    expect(await flush()).toBe(2);

    expect(store.snapshot().flushed).toEqual([]);
  });

  it("merges the windows of one account, kind and window start, keeping the earliest and latest times", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ keyHash: "token-1", count: 2, firstAt: AT(10), lastAt: AT(20) }));
    store.seedWindow(window({ keyHash: "token-2", count: 3, firstAt: AT(5), lastAt: AT(15) }));
    store.seedWindow(window({ keyHash: "token-1", count: 1, firstAt: AT(12), lastAt: AT(30) }));

    await flush();

    expect(store.snapshot().flushed).toEqual([
      { accountId: "u-ada", kind: "redeem", count: 6, firstAt: AT(5), lastAt: AT(30) },
    ]);
  });

  it("keeps the earliest first time and the latest last time whatever order the windows come in", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ keyHash: "token-1", firstAt: AT(5), lastAt: AT(30) }));
    store.seedWindow(window({ keyHash: "token-2", firstAt: AT(10), lastAt: AT(20) }));

    await flush();

    expect(store.snapshot().flushed).toEqual([
      { accountId: "u-ada", kind: "redeem", count: 2, firstAt: AT(5), lastAt: AT(30) },
    ]);
  });

  it("keeps the kinds and the window starts of one account apart", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "redeem" }));
    store.seedWindow(window({ kind: "registration_options" }));
    store.seedWindow(window({ windowStart: new Date(WINDOW.getTime() - 3_600_000) }));

    await flush();

    expect(store.snapshot().flushed).toHaveLength(3);
  });

  it("takes along an account's other closed token windows so a batch never splits them", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ keyHash: "token-1" }));
    store.seedWindow(window({ keyHash: "token-2", lastAt: AT(25) }));

    const flushed = await flush(1);

    expect(flushed).toBe(2);
    expect(store.snapshot().flushed).toEqual([
      { accountId: "u-ada", kind: "redeem", count: 2, firstAt: AT(5), lastAt: AT(25) },
    ]);
  });

  it("keeps flushing batches until no closed window is left, in one transaction each", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada" }));
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada", windowStart: AT(-60) }));
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada", windowStart: AT(-120) }));

    expect(await flush(1)).toBe(3);

    expect(store.transactionCount).toBe(4);
    expect(store.snapshot().windows).toEqual([]);
    expect(store.snapshot().flushed).toHaveLength(3);
  });

  it("takes the oldest windows first when a batch cannot hold them all", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada", windowStart: AT(-60) }));
    store.seedWindow(window({ kind: "request", keyHash: "dest-ada", windowStart: AT(-120) }));

    await flush(1);

    expect(store.snapshot().flushed.map((entry) => entry.count)).toEqual([1, 1]);
    expect(store.snapshot().windows).toEqual([]);
  });

  it("rolls the batch back when recording fails", async () => {
    const { store, flush } = fixture();
    store.seedWindow(window());
    const before = store.snapshot();
    const original = store.transaction.bind(store);
    store.transaction = (work) =>
      original(async (tx) =>
        work({
          ...tx,
          lockFlush: () => tx.lockFlush(),
          takeClosedWindows: (closedBefore, limit) => tx.takeClosedWindows(closedBefore, limit),
          accountsByDestinationHash: (hashes) => tx.accountsByDestinationHash(hashes),
          accountsByTokenHash: (hashes) => tx.accountsByTokenHash(hashes),
          takeClosedTokenWindowsOf: (ids, closedBefore) =>
            tx.takeClosedTokenWindowsOf(ids, closedBefore),
          recordFlushedAttempts: () => Promise.reject(new Error("recordFlushedAttempts failed")),
        }),
      );

    await expect(flush()).rejects.toThrow("recordFlushedAttempts failed");

    expect(store.snapshot()).toEqual(before);
  });
});
