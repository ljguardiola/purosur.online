import { describe, expect, it } from "vitest";
import { SNAPSHOT_UPLOAD_DEADLINE_MS } from "../model/snapshot-generation.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotObjects, FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";
import { verifySnapshotGenerations } from "./verify-snapshot-generations.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const SHA = "d".repeat(64);

function declaredAgo(milliseconds: number): Date {
  return new Date(NOW.getTime() - milliseconds);
}

function verify(store: FakeSnapshotStore, objects: FakeSnapshotObjects) {
  return verifySnapshotGenerations({ store, clock: new FixedClock(NOW), objects });
}

function storeWithGeneration(
  overrides: Parameters<FakeSnapshotStore["seedGeneration"]>[0] = { id: "generation-1" },
): FakeSnapshotStore {
  const store = new FakeSnapshotStore();
  store.seedGeneration({ size: 2048, sha256: SHA, ...overrides });
  return store;
}

describe("verifySnapshotGenerations", () => {
  it.each(["declared", "uploaded"] as const)(
    "verifies a %s generation whose object has the declared size and hash",
    async (status) => {
      const store = storeWithGeneration({ id: "generation-1", status });
      const objects = new FakeSnapshotObjects();
      objects.seed("register-1", "generation-1", { size: 2048, sha256: SHA });

      const summary = await verify(store, objects);

      expect(summary).toEqual({ verified: 1, failed: 0, waiting: 0, unreadable: 0 });
      expect(store.snapshot().generations[0]).toMatchObject({
        status: "verified",
        failureReason: null,
      });
    },
  );

  it("fails a generation whose object has another hash", async () => {
    const store = storeWithGeneration();
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "generation-1", { size: 2048, sha256: "e".repeat(64) });

    const summary = await verify(store, objects);

    expect(summary).toEqual({ verified: 0, failed: 1, waiting: 0, unreadable: 0 });
    expect(store.snapshot().generations[0]).toMatchObject({
      status: "failed",
      failureReason: "hash_mismatch",
    });
  });

  it("fails a generation whose object has another size, even with the same hash", async () => {
    const store = storeWithGeneration();
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "generation-1", { size: 2049, sha256: SHA });

    await verify(store, objects);

    expect(store.snapshot().generations[0]).toMatchObject({
      status: "failed",
      failureReason: "size_mismatch",
    });
  });

  it("keeps waiting for an object that has not appeared within the upload deadline", async () => {
    const store = storeWithGeneration({
      id: "generation-1",
      createdAt: declaredAgo(SNAPSHOT_UPLOAD_DEADLINE_MS),
    });

    const summary = await verify(store, new FakeSnapshotObjects());

    expect(summary).toEqual({ verified: 0, failed: 0, waiting: 1, unreadable: 0 });
    expect(store.snapshot().generations[0]?.status).toBe("declared");
  });

  it("fails an object that never appeared once the upload deadline passed", async () => {
    const store = storeWithGeneration({
      id: "generation-1",
      createdAt: declaredAgo(SNAPSHOT_UPLOAD_DEADLINE_MS + 1),
    });

    const summary = await verify(store, new FakeSnapshotObjects());

    expect(summary).toEqual({ verified: 0, failed: 1, waiting: 0, unreadable: 0 });
    expect(store.snapshot().generations[0]).toMatchObject({
      status: "failed",
      failureReason: "never_uploaded",
    });
  });

  it("does not look at generations that are already settled", async () => {
    const store = storeWithGeneration({ id: "generation-1", status: "failed" });
    store.seedGeneration({ id: "generation-2", status: "verified" });
    const objects = new FakeSnapshotObjects();

    const summary = await verify(store, objects);

    expect(summary).toEqual({ verified: 0, failed: 0, waiting: 0, unreadable: 0 });
    expect(objects.inspected).toEqual([]);
  });

  it("settles each generation on its own", async () => {
    const store = storeWithGeneration({ id: "good" });
    store.seedGeneration({ id: "bad", size: 2048, sha256: SHA });
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "good", { size: 2048, sha256: SHA });
    objects.seed("register-1", "bad", { size: 2048, sha256: "f".repeat(64) });

    const summary = await verify(store, objects);

    expect(summary).toEqual({ verified: 1, failed: 1, waiting: 0, unreadable: 0 });
  });

  it("leaves a generation whose object cannot be read unsettled and settles the rest", async () => {
    const store = storeWithGeneration({ id: "unreadable" });
    store.seedGeneration({ id: "good", size: 2048, sha256: SHA });
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "unreadable", { size: 2048, sha256: SHA });
    objects.seed("register-1", "good", { size: 2048, sha256: SHA });
    objects.failingInspections.add("register-1/unreadable");

    const summary = await verify(store, objects);

    expect(summary).toEqual({ verified: 1, failed: 0, waiting: 0, unreadable: 1 });
    expect(store.snapshot().generations.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "unreadable", status: "declared" },
      { id: "good", status: "verified" },
    ]);
  });

  it("reads the object outside any transaction and settles under the register's lock", async () => {
    const store = storeWithGeneration();
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "generation-1", { size: 2048, sha256: SHA });
    const opened: number[] = [];
    const inspect = objects.inspect.bind(objects);
    objects.inspect = async (registerId, generationId) => {
      opened.push(store.transactionsOpened);
      return inspect(registerId, generationId);
    };

    await verify(store, objects);

    expect(opened).toEqual([1]);
    expect(store.operationOrder).toEqual([
      "unsettledGenerations",
      "lockRegisterSnapshots:register-1",
      "findGeneration:register-1",
      "settleGeneration",
    ]);
  });

  it("never overwrites a generation settled while its object was being read", async () => {
    const store = storeWithGeneration();
    const objects = new FakeSnapshotObjects();
    objects.seed("register-1", "generation-1", { size: 2048, sha256: "e".repeat(64) });
    const inspect = objects.inspect.bind(objects);
    objects.inspect = async (registerId, generationId) => {
      const content = await inspect(registerId, generationId);
      await store.transaction(async (tx) => {
        await tx.settleGeneration(generationId, { kind: "verified" });
      });
      return content;
    };

    const summary = await verify(store, objects);

    expect(summary).toEqual({ verified: 0, failed: 0, waiting: 0, unreadable: 0 });
    expect(store.snapshot().generations[0]).toMatchObject({
      status: "verified",
      failureReason: null,
    });
  });
});
