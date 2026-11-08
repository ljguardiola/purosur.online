import { describe, expect, it } from "vitest";
import { SequentialInstallationKeys } from "../../shared/test-support/sequential-installation-keys.js";
import { rotateRegisterSnapshotKey } from "./rotate-register-snapshot-key.js";
import { FakeSnapshotKeyRotationStore } from "./test-support/fake-snapshot-key-rotation-store.js";

function setup() {
  const store = new FakeSnapshotKeyRotationStore();
  const keys = new SequentialInstallationKeys();
  store.seedRegister("register-1");
  return { store, keys };
}

function rotate({ store, keys }: ReturnType<typeof setup>, registerId = "register-1") {
  return rotateRegisterSnapshotKey({ store, keys }, { registerId, actorId: "actor-1" });
}

describe("rotateRegisterSnapshotKey", () => {
  it("adds the next version with a freshly generated key", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "old-key" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 2 });
    expect(world.store.snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "old-key" },
      { registerId: "register-1", version: 2, key: "key-1" },
    ]);
  });

  it("rotates from the latest version, whatever order the versions were stored in", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 3, key: "k3" });
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.store.seedSnapshotKey({ registerId: "register-1", version: 2, key: "k2" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 4 });
  });

  it("leaves another register's keys alone", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.store.seedSnapshotKey({ registerId: "register-2", version: 5, key: "other" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 2 });
  });

  it("records the previous and the new version with the actor", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });

    await rotate(world);

    expect(world.store.rotations).toEqual([
      { registerId: "register-1", previousVersion: 1, newVersion: 2, actorId: "actor-1" },
    ]);
  });

  it("locks the register's keys before writing", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });

    await rotate(world);

    expect(world.store.operationOrder).toEqual([
      "lockRegisterSnapshotKeys",
      "recordSnapshotKey",
      "recordSnapshotKeyRotation",
    ]);
  });

  it("writes nothing for a register that does not exist", async () => {
    const world = setup();

    expect(await rotate(world, "register-unknown")).toEqual({ kind: "register_not_found" });
    expect(world.store.snapshotKeys).toEqual([]);
    expect(world.store.rotations).toEqual([]);
  });

  it("writes nothing for a register that was never handed a key", async () => {
    const world = setup();

    expect(await rotate(world)).toEqual({ kind: "no_key_yet" });
    expect(world.store.snapshotKeys).toEqual([]);
    expect(world.store.rotations).toEqual([]);
  });

  it("leaves the keys as they were when the audit record cannot be written", async () => {
    const world = setup();
    world.store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.store.failingAudit = true;

    await expect(rotate(world)).rejects.toThrow("recordSnapshotKeyRotation failed");
    expect(world.store.snapshotKeys).toEqual([{ registerId: "register-1", version: 1, key: "k1" }]);
    expect(world.store.rotations).toEqual([]);
  });
});
