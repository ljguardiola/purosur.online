import { describe, expect, it } from "vitest";
import { consultBitlockerRecoveryKey } from "./consult-bitlocker-recovery-key.js";
import { FakeBitlockerRecoveryKeyStore } from "./test-support/fake-bitlocker-recovery-key-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T15:30:00.000Z");
const RECOVERY_KEY = "000011-000022-000033-000044-000055-000066-000077-000088";

function setup() {
  const store = new FakeBitlockerRecoveryKeyStore();
  store.seedRegister("register-1", "branch-1");
  store.seedInstallation({
    registerId: "register-1",
    installationId: "installation-1",
    revokedAt: null,
  });
  store.seedRecoveryKey({
    installationId: "installation-1",
    recoveryKey: RECOVERY_KEY,
    keyIdentifier: "8F3A2C1D",
    loadedAt: new Date("2026-03-01T10:00:00.000Z"),
    loadedBy: "actor-0",
  });
  return { store, clock: new FixedClock(NOW) };
}

function consult(
  { store, clock }: ReturnType<typeof setup>,
  input: { branchId?: string; registerId?: string } = {},
) {
  return consultBitlockerRecoveryKey(
    { store, clock },
    {
      branchId: input.branchId ?? "branch-1",
      registerId: input.registerId ?? "register-1",
      actorId: "actor-1",
    },
  );
}

describe("consultBitlockerRecoveryKey", () => {
  it("returns the key and identifier loaded for the installation in service", async () => {
    expect(await consult(setup())).toEqual({
      kind: "consulted",
      installationId: "installation-1",
      recoveryKey: RECOVERY_KEY,
      keyIdentifier: "8F3A2C1D",
    });
  });

  it("records who consulted it, when, for which register and installation", async () => {
    const world = setup();

    await consult(world);

    expect(world.store.snapshot().consultations).toEqual([
      { registerId: "register-1", installationId: "installation-1", actorId: "actor-1", at: NOW },
    ]);
  });

  it("changes nothing else", async () => {
    const world = setup();
    const before = world.store.snapshot();

    await consult(world);

    expect(world.store.snapshot()).toEqual({
      ...before,
      consultations: expect.any(Array),
    });
  });

  it("refuses a register of another branch, recording nothing", async () => {
    const world = setup();

    expect(await consult(world, { branchId: "branch-2" })).toEqual({ kind: "register_not_found" });
    expect(world.store.snapshot().consultations).toEqual([]);
    expect(world.store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses a register with no installation in service, recording nothing", async () => {
    const world = setup();
    world.store.seedRegister("register-2", "branch-1");

    expect(await consult(world, { registerId: "register-2" })).toEqual({
      kind: "no_current_installation",
    });
    expect(world.store.snapshot().consultations).toEqual([]);
  });

  it("does not offer the key of a revoked installation", async () => {
    const world = setup();
    world.store.seedRegister("register-2", "branch-1");
    world.store.seedInstallation({
      registerId: "register-2",
      installationId: "installation-2",
      revokedAt: new Date("2026-03-02T00:00:00.000Z"),
    });
    world.store.seedRecoveryKey({
      installationId: "installation-2",
      recoveryKey: RECOVERY_KEY,
      keyIdentifier: "AAAAAAAA",
      loadedAt: new Date("2026-03-01T10:00:00.000Z"),
      loadedBy: "actor-0",
    });

    expect(await consult(world, { registerId: "register-2" })).toEqual({
      kind: "no_current_installation",
    });
  });

  it("refuses an installation whose key was never loaded, recording nothing", async () => {
    const world = setup();
    world.store.seedRegister("register-2", "branch-1");
    world.store.seedInstallation({
      registerId: "register-2",
      installationId: "installation-2",
      revokedAt: null,
    });

    expect(await consult(world, { registerId: "register-2" })).toEqual({ kind: "not_loaded" });
    expect(world.store.snapshot().consultations).toEqual([]);
  });

  it("gives nothing back when recording the consultation fails", async () => {
    const world = setup();
    world.store.failingWrites.add("recordRecoveryKeyConsulted");

    await expect(consult(world)).rejects.toThrow("recordRecoveryKeyConsulted failed");
    expect(world.store.snapshot().consultations).toEqual([]);
  });
});
