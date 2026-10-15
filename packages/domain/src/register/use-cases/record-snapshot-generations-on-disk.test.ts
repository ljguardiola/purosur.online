import { describe, expect, it } from "vitest";
import { recordSnapshotGenerationsOnDisk } from "./record-snapshot-generations-on-disk.js";
import { FakeSnapshotDiskStore } from "./test-support/fake-snapshot-disk-store.js";

function report(store: FakeSnapshotDiskStore, generationIds: string[], registerId = "register-1") {
  return recordSnapshotGenerationsOnDisk({ store }, { registerId, generationIds });
}

describe("recordSnapshotGenerationsOnDisk", () => {
  it("marks the reported generations as on the register's disk and the rest of the register's as not", async () => {
    const store = new FakeSnapshotDiskStore();
    store.seedGeneration({ id: "kept", onRegisterDisk: false });
    store.seedGeneration({ id: "removed", onRegisterDisk: true });
    store.seedGeneration({ id: "still-kept", onRegisterDisk: true });

    expect(await report(store, ["kept", "still-kept"])).toEqual({ kind: "recorded" });

    expect(store.onDiskIds()).toEqual(["kept", "still-kept"]);
  });

  it("marks every generation of the register as off its disk when it reports none", async () => {
    const store = new FakeSnapshotDiskStore();
    store.seedGeneration({ id: "a", onRegisterDisk: true });
    store.seedGeneration({ id: "b", onRegisterDisk: true });

    await report(store, []);

    expect(store.onDiskIds()).toEqual([]);
  });

  it("ignores a reported id the cloud does not know", async () => {
    const store = new FakeSnapshotDiskStore();
    store.seedGeneration({ id: "known" });

    await report(store, ["known", "unknown"]);

    expect(store.generations.map(({ id }) => id)).toEqual(["known"]);
    expect(store.onDiskIds()).toEqual(["known"]);
  });

  it("leaves the generations of another register as they are", async () => {
    const store = new FakeSnapshotDiskStore();
    store.seedGeneration({ id: "mine" });
    store.seedGeneration({ id: "theirs", registerId: "register-2", onRegisterDisk: true });

    await report(store, ["mine", "theirs"]);

    expect(store.generations).toEqual([
      { id: "mine", registerId: "register-1", onRegisterDisk: true },
      { id: "theirs", registerId: "register-2", onRegisterDisk: true },
    ]);
  });

  it("takes the register's snapshot lock before it records", async () => {
    const store = new FakeSnapshotDiskStore();

    await report(store, []);

    expect(store.operations).toEqual([
      "lockRegisterSnapshots:register-1",
      "recordGenerationsOnRegisterDisk:register-1",
    ]);
  });
});
