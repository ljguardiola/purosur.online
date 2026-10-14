import { describe, expect, it } from "vitest";
import { applySnapshotRetention } from "./apply-snapshot-retention.js";
import { reportSnapshotCorruption } from "./report-snapshot-corruption.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotObjects, FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

const NOW = new Date("2026-10-14T15:30:00.000Z");

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function apply(store: FakeSnapshotStore, objects: FakeSnapshotObjects) {
  return applySnapshotRetention({ store, lanes: store, clock: new FixedClock(NOW), objects });
}

function seedRecent(store: FakeSnapshotStore, registerId = "register-1"): void {
  for (let index = 0; index < 6; index += 1) {
    store.seedGeneration({
      id: `${registerId}-recent${index}`,
      registerId,
      status: "verified",
      createdAt: minutesBefore(index),
    });
  }
}

function objectsFor(store: FakeSnapshotStore): FakeSnapshotObjects {
  const objects = new FakeSnapshotObjects();
  for (const generation of store.snapshot().generations) {
    if (!generation.objectDeleted) {
      objects.seed(generation.registerId, generation.id, { size: 1, sha256: "a".repeat(64) });
    }
  }
  return objects;
}

describe("applySnapshotRetention", () => {
  it("marks the generations it does not keep as pruned and deletes their objects", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({
      id: "old",
      status: "verified",
      createdAt: minutesBefore(3 * 24 * 60 + 600),
    });
    store.seedGeneration({
      id: "old-sibling",
      status: "verified",
      createdAt: minutesBefore(3 * 24 * 60 + 610),
    });
    const objects = objectsFor(store);

    const summary = await apply(store, objects);

    expect(summary).toEqual({ pruned: 1, objectsDeleted: 1, objectsPending: 0 });
    const generations = store.snapshot().generations;
    expect(generations.find((g) => g.id === "old-sibling")).toMatchObject({
      pruned: true,
      objectDeleted: true,
    });
    expect(generations.find((g) => g.id === "old")).toMatchObject({ pruned: false });
    expect(objects.has("register-1", "old-sibling")).toBe(false);
    expect(objects.has("register-1", "old")).toBe(true);
  });

  it("uses the stored lifecycle rules when there are some", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({
      id: "yesterday",
      status: "verified",
      createdAt: minutesBefore(26 * 60),
    });
    store.seedLifecycleRules({ hourly: 1, daily: 1, monthly: 1 });

    await apply(store, objectsFor(store));

    expect(store.snapshot().generations.find((g) => g.id === "yesterday")?.pruned).toBe(true);
  });

  it("falls back to the default rules when none are stored", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({
      id: "yesterday",
      status: "verified",
      createdAt: minutesBefore(26 * 60),
    });

    await apply(store, objectsFor(store));

    expect(store.snapshot().generations.find((g) => g.id === "yesterday")?.pruned).toBe(false);
  });

  it("deletes the objects of failed generations", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed", failureReason: "hash_mismatch" });
    const objects = objectsFor(store);

    await apply(store, objects);

    expect(objects.has("register-1", "failed")).toBe(false);
  });

  it("never touches a generation awaiting verification", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "waiting", status: "uploaded" });
    const objects = objectsFor(store);

    await apply(store, objects);

    expect(store.snapshot().generations.find((g) => g.id === "waiting")?.pruned).toBe(false);
    expect(objects.has("register-1", "waiting")).toBe(true);
  });

  it("deletes nothing of a register that reported corruption", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed" });
    store.seedGeneration({ id: "pruned-earlier", status: "verified", pruned: true });
    store.seedFreeze({ registerId: "register-1", stage: "copy", frozenAt: NOW });
    const before = store.snapshot();
    const objects = objectsFor(store);

    const summary = await apply(store, objects);

    expect(summary).toEqual({ pruned: 0, objectsDeleted: 0, objectsPending: 0 });
    expect(store.snapshot()).toEqual(before);
    expect(objects.removed).toEqual([]);
  });

  it("applies retention to each register on its own", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store, "register-1");
    seedRecent(store, "register-2");
    store.seedGeneration({ id: "failed-1", registerId: "register-1", status: "failed" });
    store.seedFreeze({ registerId: "register-2", stage: "copy", frozenAt: NOW });
    store.seedGeneration({ id: "failed-2", registerId: "register-2", status: "failed" });

    await apply(store, objectsFor(store));

    const generations = store.snapshot().generations;
    expect(generations.find((g) => g.id === "failed-1")?.pruned).toBe(true);
    expect(generations.find((g) => g.id === "failed-2")?.pruned).toBe(false);
  });

  it("commits the pruning before it deletes any object", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed" });
    const objects = objectsFor(store);
    const remove = objects.remove.bind(objects);
    let prunedWhenRemoving: boolean | undefined;
    objects.remove = async (registerId, generationId) => {
      prunedWhenRemoving = store.snapshot().generations.find((g) => g.id === generationId)?.pruned;
      return remove(registerId, generationId);
    };

    await apply(store, objects);

    expect(prunedWhenRemoving).toBe(true);
  });

  it("holds the register's snapshot lane from reading its generations until each deletion is recorded", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed" });

    await apply(store, objectsFor(store));

    expect(store.operationOrder).toEqual([
      "registersWithGenerations",
      "registerSnapshotLane:register-1",
      "lockRegisterSnapshots:register-1",
      "retentionFrozen",
      "lifecycleRules",
      "generationsOf",
      "markPruned",
      "prunedWithObject",
      "markObjectDeleted",
      "registerSnapshotLaneReleased:register-1",
    ]);
  });

  it("makes a corruption report arriving while objects are deleted wait until the deletions are recorded", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed-1", status: "failed" });
    store.seedGeneration({ id: "failed-2", status: "failed" });
    const objects = objectsFor(store);
    const remove = objects.remove.bind(objects);
    let report: Promise<unknown> | undefined;
    objects.remove = async (registerId, generationId) => {
      if (!report) {
        report = reportSnapshotCorruption(
          { store, clock: new FixedClock(NOW) },
          { registerId, stage: "copy" },
        );
        await Promise.race([report, store.someoneWaitedForALane]);
      }
      return remove(registerId, generationId);
    };

    const summary = await apply(store, objects);
    await report;

    expect(summary).toEqual({ pruned: 2, objectsDeleted: 2, objectsPending: 0 });
    const order = store.operationOrder;
    expect(order.indexOf("freezeRetention")).toBeGreaterThan(
      order.lastIndexOf("markObjectDeleted"),
    );
    expect(store.snapshot().freezes).toHaveLength(1);
  });

  it("retries next run an object it failed to delete, without pruning it again", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed" });
    const objects = objectsFor(store);
    objects.failingRemovals.add("register-1/failed");

    const first = await apply(store, objects);

    expect(first).toEqual({ pruned: 1, objectsDeleted: 0, objectsPending: 1 });
    expect(store.snapshot().generations.find((g) => g.id === "failed")).toMatchObject({
      pruned: true,
      objectDeleted: false,
    });

    objects.failingRemovals.clear();
    const second = await apply(store, objects);

    expect(second).toEqual({ pruned: 0, objectsDeleted: 1, objectsPending: 0 });
    expect(objects.has("register-1", "failed")).toBe(false);
    expect(store.snapshot().generations.find((g) => g.id === "failed")?.objectDeleted).toBe(true);
  });

  it("treats an object already gone as deleted", async () => {
    const store = new FakeSnapshotStore();
    seedRecent(store);
    store.seedGeneration({ id: "failed", status: "failed" });

    const summary = await apply(store, new FakeSnapshotObjects());

    expect(summary).toEqual({ pruned: 1, objectsDeleted: 1, objectsPending: 0 });
  });
});
