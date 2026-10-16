import { describe, expect, it } from "vitest";
import type { VersionedKey } from "../model/installation-key.js";
import { revokeInstallationAndRotateKeys } from "./revoke-installation-and-rotate-keys.js";
import { FakeEveryInstallationRevocationStore } from "./test-support/fake-every-installation-revocation-store.js";
import { SequentialInstallationKeys } from "./test-support/fake-register-store.js";

const REVOKED_AT = new Date("2026-03-10T15:30:00.000Z");

function setup(
  options: {
    active?: boolean;
    snapshotKeys?: VersionedKey[];
    contingencyTicketKeys?: VersionedKey[];
  } = {},
) {
  const store = new FakeEveryInstallationRevocationStore();
  store.seedRegister("register-1");
  store.seedInstallation({
    registerId: "register-1",
    deviceId: "device-1",
    hostname: "caja-01",
    windowsVersion: "10.0.22631",
    revokedAt: options.active === false ? new Date("2026-01-01T00:00:00.000Z") : null,
  });
  for (const key of options.snapshotKeys ?? []) {
    store.seedSnapshotKey("register-1", key);
  }
  for (const key of options.contingencyTicketKeys ?? []) {
    store.seedContingencyTicketKey("register-1", key);
  }
  return store;
}

function revoke(store: FakeEveryInstallationRevocationStore) {
  return store.transaction((tx) =>
    revokeInstallationAndRotateKeys(tx, new SequentialInstallationKeys(), "register-1", REVOKED_AT),
  );
}

describe("revokeInstallationAndRotateKeys", () => {
  it("revokes the installation in service at the given time and answers its device", async () => {
    const store = setup();

    const revoked = await revoke(store);

    expect(revoked?.installation).toEqual({
      deviceId: "device-1",
      hostname: "caja-01",
      windowsVersion: "10.0.22631",
    });
    expect(store.snapshot().installations).toEqual([
      expect.objectContaining({ deviceId: "device-1", revokedAt: REVOKED_AT }),
    ]);
  });

  it("adds a new version after the latest of each key set, keeping the versions held beside it", async () => {
    const store = setup({
      snapshotKeys: [
        { version: 3, key: "snapshot-3" },
        { version: 1, key: "snapshot-1" },
      ],
      contingencyTicketKeys: [{ version: 5, key: "ticket-5" }],
    });

    const revoked = await revoke(store);

    expect(revoked).toMatchObject({
      snapshotKeyVersion: { previous: 3, current: 4 },
      contingencyTicketKeyVersion: { previous: 5, current: 6 },
    });
    const state = store.snapshot();
    expect(state.snapshotKeys).toEqual([
      { registerId: "register-1", version: 3, key: "snapshot-3" },
      { registerId: "register-1", version: 1, key: "snapshot-1" },
      { registerId: "register-1", version: 4, key: "key-1" },
    ]);
    expect(state.contingencyTicketKeys).toEqual([
      { registerId: "register-1", version: 5, key: "ticket-5" },
      { registerId: "register-1", version: 6, key: "key-2" },
    ]);
  });

  it("creates the first version of a key set that is empty, with no previous version", async () => {
    const store = setup();

    const revoked = await revoke(store);

    expect(revoked).toMatchObject({
      snapshotKeyVersion: { previous: null, current: 1 },
      contingencyTicketKeyVersion: { previous: null, current: 1 },
    });
    expect(store.snapshot().snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-1" },
    ]);
    expect(store.snapshot().contingencyTicketKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-2" },
    ]);
  });

  it("revokes before locking the keys, and locks them before recording the new ones", async () => {
    const store = setup();

    await revoke(store);

    expect(store.operationOrder).toEqual([
      "revokeActiveInstallation:register-1",
      "lockRegisterKeys:register-1",
      "recordSnapshotKey:register-1",
      "recordContingencyTicketKey:register-1",
    ]);
  });

  it("answers nothing and rotates no key when the register has no installation in service", async () => {
    const store = setup({
      active: false,
      snapshotKeys: [{ version: 1, key: "snapshot-1" }],
      contingencyTicketKeys: [{ version: 1, key: "ticket-1" }],
    });
    const before = store.snapshot();

    expect(await revoke(store)).toBeNull();
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["revokeActiveInstallation:register-1"]);
  });
});
