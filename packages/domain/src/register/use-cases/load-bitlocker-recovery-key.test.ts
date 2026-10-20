import { describe, expect, it } from "vitest";
import { loadBitlockerRecoveryKey } from "./load-bitlocker-recovery-key.js";
import { FakeBitlockerRecoveryKeyStore } from "./test-support/fake-bitlocker-recovery-key-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T15:30:00.000Z");
const RECOVERY_KEY = "000011-000022-000033-000044-000055-000066-000077-000088";
const KEY_IDENTIFIER = "8F3A2C1D";

function setup() {
  const store = new FakeBitlockerRecoveryKeyStore();
  store.seedRegister("register-1", "branch-1");
  store.seedInstallation({
    registerId: "register-1",
    installationId: "installation-1",
    revokedAt: null,
  });
  return { store, clock: new FixedClock(NOW) };
}

function load(
  { store, clock }: ReturnType<typeof setup>,
  input: { branchId?: string; registerId?: string } = {},
) {
  return loadBitlockerRecoveryKey(
    { store, clock },
    {
      branchId: input.branchId ?? "branch-1",
      registerId: input.registerId ?? "register-1",
      actorId: "actor-1",
      recoveryKey: RECOVERY_KEY,
      keyIdentifier: KEY_IDENTIFIER,
    },
  );
}

describe("loadBitlockerRecoveryKey", () => {
  it("stores the key and its identifier for the installation in service", async () => {
    const world = setup();

    expect(await load(world)).toEqual({
      kind: "loaded",
      installationId: "installation-1",
      loadedAt: NOW,
    });
    expect(world.store.snapshot().keys).toEqual([
      {
        installationId: "installation-1",
        recoveryKey: RECOVERY_KEY,
        keyIdentifier: KEY_IDENTIFIER,
        loadedAt: NOW,
        loadedBy: "actor-1",
      },
    ]);
  });

  it("records who loaded it for which register and installation", async () => {
    const world = setup();

    await load(world);

    expect(world.store.snapshot().loads).toEqual([
      { registerId: "register-1", installationId: "installation-1", actorId: "actor-1", at: NOW },
    ]);
  });

  it("locks the register before reading anything else", async () => {
    const world = setup();

    await load(world);

    expect(world.store.operationOrder).toEqual([
      "lockBranchRegister",
      "currentInstallationOf",
      "hasRecoveryKey",
      "storeRecoveryKey",
      "recordRecoveryKeyLoaded",
    ]);
  });

  it("loads the key of the installation in service, not of a revoked one", async () => {
    const world = setup();
    world.store.seedInstallation({
      registerId: "register-1",
      installationId: "installation-0",
      revokedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    world.store.seedRecoveryKey({
      installationId: "installation-0",
      recoveryKey: "000099-000099-000099-000099-000099-000099-000099-000099",
      keyIdentifier: "00000000",
      loadedAt: new Date("2026-02-01T00:00:00.000Z"),
      loadedBy: "actor-0",
    });

    expect(await load(world)).toMatchObject({ kind: "loaded", installationId: "installation-1" });
  });

  it("refuses a register of another branch, storing and recording nothing", async () => {
    const world = setup();

    expect(await load(world, { branchId: "branch-2" })).toEqual({ kind: "register_not_found" });
    expect(world.store.snapshot()).toMatchObject({ keys: [], loads: [] });
    expect(world.store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses an unknown register", async () => {
    const world = setup();

    expect(await load(world, { registerId: "register-9" })).toEqual({
      kind: "register_not_found",
    });
  });

  it("refuses a register with no installation in service, storing and recording nothing", async () => {
    const world = setup();
    world.store.seedRegister("register-2", "branch-1");
    world.store.seedInstallation({
      registerId: "register-2",
      installationId: "installation-2",
      revokedAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(await load(world, { registerId: "register-2" })).toEqual({
      kind: "no_current_installation",
    });
    expect(world.store.snapshot()).toMatchObject({ keys: [], loads: [] });
  });

  it("refuses a second load for the same installation, keeping the first key", async () => {
    const world = setup();
    await load(world);

    expect(await load(world)).toEqual({ kind: "already_loaded" });
    expect(world.store.snapshot().keys).toHaveLength(1);
    expect(world.store.snapshot().loads).toHaveLength(1);
  });

  it("leaves no key behind when recording who loaded it fails", async () => {
    const world = setup();
    world.store.failingWrites.add("recordRecoveryKeyLoaded");

    await expect(load(world)).rejects.toThrow("recordRecoveryKeyLoaded failed");
    expect(world.store.snapshot()).toMatchObject({ keys: [], loads: [] });
  });
});
