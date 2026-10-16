import { describe, expect, it } from "vitest";
import { registerKeysHandedOver } from "./installation-keys.js";
import { rotateRegisterSnapshotKey } from "./rotate-register-snapshot-key.js";
import {
  FakeRegisterStore,
  SequentialInstallationKeys,
} from "./test-support/fake-register-store.js";
import { FakeSnapshotKeyRotationStore } from "./test-support/fake-snapshot-key-rotation-store.js";

function setup() {
  const registers = new FakeRegisterStore();
  const store = new FakeSnapshotKeyRotationStore(registers);
  const keys = new SequentialInstallationKeys();
  store.seedRegister("register-1");
  return { registers, store, keys };
}

function rotate({ store, keys }: ReturnType<typeof setup>, registerId = "register-1") {
  return rotateRegisterSnapshotKey({ store, keys }, { registerId, actorId: "actor-1" });
}

describe("rotateRegisterSnapshotKey", () => {
  it("adds the next version with a freshly generated key", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "old-key" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 2 });
    expect(world.registers.snapshot().snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "old-key" },
      { registerId: "register-1", version: 2, key: "key-1" },
    ]);
  });

  it("rotates from the latest version, whatever order the versions were stored in", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 3, key: "k3" });
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 2, key: "k2" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 4 });
  });

  it("leaves another register's keys alone", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.registers.seedSnapshotKey({ registerId: "register-2", version: 5, key: "other" });

    expect(await rotate(world)).toEqual({ kind: "rotated", keyVersion: 2 });
  });

  it("records the previous and the new version with the actor", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });

    await rotate(world);

    expect(world.store.rotations).toEqual([
      { registerId: "register-1", previousVersion: 1, newVersion: 2, actorId: "actor-1" },
    ]);
  });

  it("locks the register's keys before writing", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });

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
    expect(world.registers.snapshot().snapshotKeys).toEqual([]);
    expect(world.store.rotations).toEqual([]);
  });

  it("writes nothing for a register that was never handed a key", async () => {
    const world = setup();

    expect(await rotate(world)).toEqual({ kind: "no_key_yet" });
    expect(world.registers.snapshot().snapshotKeys).toEqual([]);
    expect(world.store.rotations).toEqual([]);
  });

  it("leaves the keys as they were when the audit record cannot be written", async () => {
    const world = setup();
    world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
    world.store.failingAudit = true;

    await expect(rotate(world)).rejects.toThrow("recordSnapshotKeyRotation failed");
    expect(world.registers.snapshot().snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "k1" },
    ]);
    expect(world.store.rotations).toEqual([]);
  });

  describe("followed by the keys handed to an installation", () => {
    function handedOver({ registers, keys }: ReturnType<typeof setup>) {
      return registers.transaction((tx) => registerKeysHandedOver(tx, keys, "register-1"));
    }

    it("makes the new version the latest and keeps the retired one while a generation retains it", async () => {
      const world = setup();
      world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
      world.registers.seedSnapshotGeneration({
        registerId: "register-1",
        keyVersion: 1,
        status: "verified",
        pruned: false,
      });

      await rotate(world);

      expect((await handedOver(world)).snapshotKeyVersions).toEqual([
        { version: 1, key: "k1" },
        { version: 2, key: "key-1" },
      ]);
    });

    it("drops the retired version once no generation retains it", async () => {
      const world = setup();
      world.registers.seedSnapshotKey({ registerId: "register-1", version: 1, key: "k1" });
      world.registers.seedSnapshotGeneration({
        registerId: "register-1",
        keyVersion: 1,
        status: "verified",
        pruned: true,
      });

      await rotate(world);

      expect((await handedOver(world)).snapshotKeyVersions).toEqual([{ version: 2, key: "key-1" }]);
    });
  });
});
