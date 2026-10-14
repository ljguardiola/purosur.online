import { describe, expect, it } from "vitest";
import { listRestorableSnapshotGenerations } from "./list-restorable-snapshot-generations.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

function list(store: FakeSnapshotStore) {
  return listRestorableSnapshotGenerations({ store }, { registerId: "register-1" });
}

describe("listRestorableSnapshotGenerations", () => {
  it("lists only the register's verified generations, newest first", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({
      id: "older",
      status: "verified",
      createdAt: new Date("2026-10-14T10:00:00.000Z"),
    });
    store.seedGeneration({
      id: "newer",
      status: "verified",
      createdAt: new Date("2026-10-14T11:00:00.000Z"),
    });
    store.seedGeneration({ id: "declared", status: "declared" });
    store.seedGeneration({ id: "uploaded", status: "uploaded" });
    store.seedGeneration({ id: "failed", status: "failed" });
    store.seedGeneration({ id: "pruned", status: "verified", pruned: true });
    store.seedGeneration({ id: "foreign", status: "verified", registerId: "register-other" });

    const generations = await list(store);

    expect(generations.map((generation) => generation.generationId)).toEqual(["newer", "older"]);
  });

  it("describes each generation with what a restore needs", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({
      id: "generation-1",
      status: "verified",
      createdAt: new Date("2026-10-14T10:00:00.000Z"),
      size: 777,
      sha256: "9".repeat(64),
      keyVersion: 3,
    });

    expect(await list(store)).toEqual([
      {
        generationId: "generation-1",
        registerId: "register-1",
        createdAt: new Date("2026-10-14T10:00:00.000Z"),
        size: 777,
        sha256: "9".repeat(64),
        keyVersion: 3,
      },
    ]);
  });

  it("lists nothing for a register without verified generations", async () => {
    expect(await list(new FakeSnapshotStore())).toEqual([]);
  });
});
