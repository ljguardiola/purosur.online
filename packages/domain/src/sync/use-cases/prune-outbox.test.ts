import { describe, expect, it } from "vitest";
import { pruneOutbox } from "./prune-outbox.js";
import { FakeOutboxPruning } from "./test-support/fake-outbox-pruning.js";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const clock = { now: () => NOW };

function daysAgo(days: number, extraMs = 0): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - extraMs);
}

describe("pruning the outbox", () => {
  it("removes the events acknowledged more than 30 days ago and says how many", async () => {
    const outbox = new FakeOutboxPruning([
      { deviceSeq: 1, acknowledgedAt: daysAgo(31) },
      { deviceSeq: 2, acknowledgedAt: daysAgo(30, 1) },
    ]);

    expect(await pruneOutbox({ outbox, clock })).toEqual({ kind: "pruned", removed: 2 });
    expect(outbox.heldSeqs).toEqual([]);
  });

  it("keeps an event acknowledged exactly 30 days ago", async () => {
    const outbox = new FakeOutboxPruning([{ deviceSeq: 1, acknowledgedAt: daysAgo(30) }]);

    expect(await pruneOutbox({ outbox, clock })).toEqual({ kind: "pruned", removed: 0 });
    expect(outbox.heldSeqs).toEqual([1]);
  });

  it("keeps what was acknowledged less than 30 days ago", async () => {
    const outbox = new FakeOutboxPruning([
      { deviceSeq: 1, acknowledgedAt: daysAgo(29) },
      { deviceSeq: 2, acknowledgedAt: NOW },
    ]);

    await pruneOutbox({ outbox, clock });

    expect(outbox.heldSeqs).toEqual([1, 2]);
  });

  it("never removes an event the cloud has not acknowledged, however old", async () => {
    const outbox = new FakeOutboxPruning([
      { deviceSeq: 1, acknowledgedAt: null },
      { deviceSeq: 2, acknowledgedAt: daysAgo(90) },
    ]);

    expect(await pruneOutbox({ outbox, clock })).toEqual({ kind: "pruned", removed: 1 });
    expect(outbox.heldSeqs).toEqual([1]);
  });

  it("asks the outbox to forget what was acknowledged before 30 days ago, counted from now", async () => {
    const outbox = new FakeOutboxPruning([]);

    await pruneOutbox({ outbox, clock });

    expect(outbox.cutoffsAsked).toEqual([daysAgo(30)]);
  });

  it("lets a failure of the outbox reach its caller", async () => {
    const outbox = new FakeOutboxPruning([]);
    outbox.failWith = new Error("the local database is busy");

    await expect(pruneOutbox({ outbox, clock })).rejects.toThrow("the local database is busy");
  });
});
