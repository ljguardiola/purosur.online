import { describe, expect, it } from "vitest";
import { revokeEveryInstallation } from "./revoke-every-installation.js";
import { FakeEveryInstallationRevocationStore } from "./test-support/fake-every-installation-revocation-store.js";
import { FixedClock, SequentialInstallationKeys } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T15:30:00.000Z");

function seedRegister(
  store: FakeEveryInstallationRevocationStore,
  registerId: string,
  options: { active?: boolean } = {},
) {
  store.seedRegister(registerId);
  store.seedInstallation({
    registerId,
    deviceId: `device-of-${registerId}`,
    hostname: `host-of-${registerId}`,
    windowsVersion: "10.0.22631",
    revokedAt: options.active === false ? new Date("2026-01-01T00:00:00.000Z") : null,
  });
  store.seedSnapshotKey(registerId, { version: 1, key: `snapshot-old-${registerId}` });
  store.seedContingencyTicketKey(registerId, { version: 1, key: `ticket-old-${registerId}` });
}

function setup(registerIds: string[] = ["register-a", "register-b"]) {
  const store = new FakeEveryInstallationRevocationStore();
  for (const registerId of registerIds) {
    seedRegister(store, registerId);
  }
  return { store, clock: new FixedClock(NOW), keys: new SequentialInstallationKeys() };
}

function revoke({ store, clock, keys }: ReturnType<typeof setup>) {
  return revokeEveryInstallation({ store, clock, keys }, { actorId: "actor-1" });
}

describe("revokeEveryInstallation", () => {
  it("revokes every installation in service at the clock's now and answers each register's new key versions", async () => {
    const world = setup();

    expect(await revoke(world)).toEqual({
      kind: "revoked",
      revokedAt: NOW,
      registers: [
        {
          registerId: "register-a",
          deviceId: "device-of-register-a",
          snapshotKeyVersion: 2,
          contingencyTicketKeyVersion: 2,
        },
        {
          registerId: "register-b",
          deviceId: "device-of-register-b",
          snapshotKeyVersion: 2,
          contingencyTicketKeyVersion: 2,
        },
      ],
    });
    expect(world.store.snapshot().installations).toEqual([
      expect.objectContaining({ deviceId: "device-of-register-a", revokedAt: NOW }),
      expect.objectContaining({ deviceId: "device-of-register-b", revokedAt: NOW }),
    ]);
  });

  it("opens one alert per revoked register naming its device", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.snapshot().alerts).toEqual([
      {
        registerId: "register-a",
        deviceId: "device-of-register-a",
        hostname: "host-of-register-a",
        windowsVersion: "10.0.22631",
      },
      {
        registerId: "register-b",
        deviceId: "device-of-register-b",
        hostname: "host-of-register-b",
        windowsVersion: "10.0.22631",
      },
    ]);
  });

  it("records for each revoked register who revoked it and its key versions before and after", async () => {
    const world = setup();

    await revoke(world);

    expect(world.store.snapshot().revocations).toEqual([
      {
        registerId: "register-a",
        deviceId: "device-of-register-a",
        revokedAt: NOW,
        actorId: "actor-1",
        snapshotKeyVersion: { previous: 1, current: 2 },
        contingencyTicketKeyVersion: { previous: 1, current: 2 },
      },
      {
        registerId: "register-b",
        deviceId: "device-of-register-b",
        revokedAt: NOW,
        actorId: "actor-1",
        snapshotKeyVersion: { previous: 1, current: 2 },
        contingencyTicketKeyVersion: { previous: 1, current: 2 },
      },
    ]);
  });

  it("goes through the registers in the order they were locked, finishing each before the next", async () => {
    const world = setup(["register-b", "register-a"]);

    await revoke(world);

    expect(world.store.operationOrder).toEqual([
      "lockEveryRegister",
      "revokeActiveInstallation:register-a",
      "lockRegisterKeys:register-a",
      "recordSnapshotKey:register-a",
      "recordContingencyTicketKey:register-a",
      "openRevocationAlert:register-a",
      "recordEveryInstallationRevocation:register-a",
      "revokeActiveInstallation:register-b",
      "lockRegisterKeys:register-b",
      "recordSnapshotKey:register-b",
      "recordContingencyTicketKey:register-b",
      "openRevocationAlert:register-b",
      "recordEveryInstallationRevocation:register-b",
    ]);
  });

  it("leaves a register without an installation in service untouched and out of the answer", async () => {
    const world = setup(["register-a"]);
    seedRegister(world.store, "register-b", { active: false });

    const outcome = await revoke(world);

    expect(outcome).toMatchObject({
      kind: "revoked",
      registers: [expect.objectContaining({ registerId: "register-a" })],
    });
    const state = world.store.snapshot();
    expect(state.snapshotKeys.filter((key) => key.registerId === "register-b")).toHaveLength(1);
    expect(
      state.contingencyTicketKeys.filter((key) => key.registerId === "register-b"),
    ).toHaveLength(1);
    expect(state.alerts.map((alert) => alert.registerId)).toEqual(["register-a"]);
    expect(state.revocations.map((revocation) => revocation.registerId)).toEqual(["register-a"]);
    expect(world.store.operationOrder).toContain("revokeActiveInstallation:register-b");
    expect(world.store.operationOrder).not.toContain("lockRegisterKeys:register-b");
  });

  it("answers that there is nothing to revoke, and changes nothing, when no installation is in service", async () => {
    const store = new FakeEveryInstallationRevocationStore();
    seedRegister(store, "register-a", { active: false });
    seedRegister(store, "register-b", { active: false });
    const before = store.snapshot();

    expect(
      await revoke({ store, clock: new FixedClock(NOW), keys: new SequentialInstallationKeys() }),
    ).toEqual({ kind: "nothing_to_revoke" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers that there is nothing to revoke when there is no register", async () => {
    const world = setup([]);

    expect(await revoke(world)).toEqual({ kind: "nothing_to_revoke" });
  });

  it("leaves every register as it was when a step fails after others were revoked", async () => {
    const world = setup();
    world.store.failingWrites.add("recordEveryInstallationRevocation:register-b");
    const before = world.store.snapshot();

    await expect(revoke(world)).rejects.toThrow(
      "recordEveryInstallationRevocation failed for register-b",
    );

    expect(world.store.snapshot()).toEqual(before);
  });
});
