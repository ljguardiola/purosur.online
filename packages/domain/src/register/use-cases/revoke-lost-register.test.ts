import { describe, expect, it } from "vitest";
import { revokeLostRegister } from "./revoke-lost-register.js";
import { FakeLostRegisterRevocationStore } from "./test-support/fake-lost-register-revocation-store.js";
import {
  FixedClock,
  SequentialInstallationKeys,
} from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T15:30:00.000Z");

function setup() {
  const store = new FakeLostRegisterRevocationStore();
  store.seedRegister("register-1", "branch-1");
  store.seedInstallation({
    registerId: "register-1",
    deviceId: "device-1",
    hostname: "caja-01",
    windowsVersion: "10.0.22631",
    revokedAt: null,
  });
  store.seedSnapshotKey("register-1", { version: 1, key: "snapshot-old" });
  store.seedContingencyTicketKey("register-1", { version: 1, key: "ticket-old" });
  return { store, clock: new FixedClock(NOW), keys: new SequentialInstallationKeys() };
}

function revoke(
  { store, clock, keys }: ReturnType<typeof setup>,
  input: { branchId?: string; registerId?: string } = {},
) {
  return revokeLostRegister(
    { store, clock, keys },
    {
      branchId: input.branchId ?? "branch-1",
      registerId: input.registerId ?? "register-1",
      actorId: "actor-1",
    },
  );
}

describe("revokeLostRegister", () => {
  it("revokes the installation in service at the clock's now and rotates both key sets", async () => {
    const world = setup();

    expect(await revoke(world)).toEqual({
      kind: "revoked",
      deviceId: "device-1",
      revokedAt: NOW,
      snapshotKeyVersion: 2,
      contingencyTicketKeyVersion: 2,
    });
    expect(world.store.snapshot().installations).toEqual([
      expect.objectContaining({ deviceId: "device-1", revokedAt: NOW }),
    ]);
  });

  it("keeps the previous key versions held beside the new ones", async () => {
    const world = setup();

    await revoke(world);

    const state = world.store.snapshot();
    expect(state.snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "snapshot-old" },
      { registerId: "register-1", version: 2, key: "key-1" },
    ]);
    expect(state.contingencyTicketKeys).toEqual([
      { registerId: "register-1", version: 1, key: "ticket-old" },
      { registerId: "register-1", version: 2, key: "key-2" },
    ]);
  });

  it("creates the first version of a key set that is empty", async () => {
    const world = setup();
    const empty = new FakeLostRegisterRevocationStore();
    empty.seedRegister("register-1", "branch-1");
    empty.seedInstallation({
      registerId: "register-1",
      deviceId: "device-1",
      hostname: "caja-01",
      windowsVersion: "10.0.22631",
      revokedAt: null,
    });

    expect(await revoke({ ...world, store: empty })).toMatchObject({
      snapshotKeyVersion: 1,
      contingencyTicketKeyVersion: 1,
    });
    expect(empty.snapshot().snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-1" },
    ]);
  });

  it("requires every user of the branch to set a new PIN", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.snapshot().branchesWithPinResetRequired).toEqual(["branch-1"]);
  });

  it("opens an alert naming the revoked device", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.snapshot().alerts).toEqual([
      {
        registerId: "register-1",
        deviceId: "device-1",
        hostname: "caja-01",
        windowsVersion: "10.0.22631",
      },
    ]);
  });

  it("records who revoked it and the key versions before and after", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.snapshot().revocations).toEqual([
      {
        registerId: "register-1",
        deviceId: "device-1",
        revokedAt: NOW,
        actorId: "actor-1",
        snapshotKeyVersion: { previous: 1, current: 2 },
        contingencyTicketKeyVersion: { previous: 1, current: 2 },
      },
    ]);
  });

  it("records no previous version for a key set that was empty", async () => {
    const world = setup();
    const empty = new FakeLostRegisterRevocationStore();
    empty.seedRegister("register-1", "branch-1");
    empty.seedInstallation({
      registerId: "register-1",
      deviceId: "device-1",
      hostname: "caja-01",
      windowsVersion: "10.0.22631",
      revokedAt: null,
    });

    await revoke({ ...world, store: empty });

    expect(empty.snapshot().revocations[0]).toMatchObject({
      snapshotKeyVersion: { previous: null, current: 1 },
      contingencyTicketKeyVersion: { previous: null, current: 1 },
    });
  });

  it("revokes before rotating the keys and rotates them before forcing the PIN resets", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.operationOrder).toEqual([
      "lockBranchRegister",
      "revokeActiveInstallation",
      "lockRegisterKeys",
      "recordSnapshotKey",
      "recordContingencyTicketKey",
      "requirePinResetOfBranchUsers",
      "openRevocationAlert",
      "recordLostRegisterRevocation",
    ]);
  });

  it("does nothing else for a register that is not found in the branch", async () => {
    const world = setup();

    expect(await revoke(world, { branchId: "branch-2" })).toEqual({ kind: "register_not_found" });
    expect(await revoke(world, { registerId: "register-unknown" })).toEqual({
      kind: "register_not_found",
    });
    expect(world.store.operationOrder).toEqual(["lockBranchRegister", "lockBranchRegister"]);
    expect(world.store.snapshot().installations[0]?.revokedAt).toBeNull();
  });

  describe("when no installation is in service", () => {
    function withoutActiveInstallation() {
      const world = setup();
      const store = new FakeLostRegisterRevocationStore();
      store.seedRegister("register-1", "branch-1");
      store.seedInstallation({
        registerId: "register-1",
        deviceId: "device-0",
        hostname: "caja-00",
        windowsVersion: "10.0.19045",
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      store.seedSnapshotKey("register-1", { version: 1, key: "snapshot-old" });
      return { ...world, store };
    }

    it("refuses and rotates nothing, forces no PIN reset, opens no alert and records no audit", async () => {
      const world = withoutActiveInstallation();

      expect(await revoke(world)).toEqual({ kind: "no_active_installation" });

      const state = world.store.snapshot();
      expect(state.snapshotKeys).toHaveLength(1);
      expect(state.contingencyTicketKeys).toEqual([]);
      expect(state.branchesWithPinResetRequired).toEqual([]);
      expect(state.alerts).toEqual([]);
      expect(state.revocations).toEqual([]);
      expect(world.store.operationOrder).toEqual(["lockBranchRegister", "revokeActiveInstallation"]);
    });
  });

  it("leaves everything as it was when a later step fails", async () => {
    const world = setup();
    world.store.failingWrites.add("requirePinResetOfBranchUsers");

    await expect(revoke(world)).rejects.toThrow("requirePinResetOfBranchUsers failed");

    const state = world.store.snapshot();
    expect(state.installations[0]?.revokedAt).toBeNull();
    expect(state.snapshotKeys).toHaveLength(1);
    expect(state.contingencyTicketKeys).toHaveLength(1);
    expect(state.alerts).toEqual([]);
    expect(state.revocations).toEqual([]);
  });
});
