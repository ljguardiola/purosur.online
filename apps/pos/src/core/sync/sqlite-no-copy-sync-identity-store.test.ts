import { resetSyncIdentityWithoutCopy } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import { SqliteNoCopySyncIdentityStore } from "./sqlite-no-copy-sync-identity-store";

const INPUT = {
  deviceId: "new-device",
  registerId: "register-1",
  firstInstallationId: "first-device",
};

let database: LocalDatabase;
let store: SqliteNoCopySyncIdentityStore;

function syncState() {
  return database
    .prepare(
      `SELECT device_id, pull_cursor, last_device_seq, last_chain_hmac, installation_revoked_at,
              sales_stopped_reason
         FROM sync_state`,
    )
    .get();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  store = new SqliteNoCopySyncIdentityStore(database);
});

afterEach(() => {
  database.close();
});

describe("the sync identity store of a register reinstalled with no copy", () => {
  it("holds no installation on a fresh database", async () => {
    expect(await store.transaction((tx) => tx.heldDeviceId())).toBeUndefined();
  });

  it("holds the installation the sync state names", async () => {
    database.prepare("UPDATE sync_state SET device_id = 'held-device'").run();

    expect(await store.transaction((tx) => tx.heldDeviceId())).toBe("held-device");
  });

  it("adopts the installation with a fresh chain and the pull cursor at zero, records the first installation, and holds the numbering and the sweep as not from a copy", async () => {
    const outcome = await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(outcome).toEqual({ kind: "reset", predecessorDeviceId: "first-device" });
    expect(syncState()).toEqual({
      device_id: "new-device",
      pull_cursor: 0,
      last_device_seq: 0,
      last_chain_hmac: null,
      installation_revoked_at: null,
      sales_stopped_reason: null,
    });
    expect(
      database.prepare("SELECT device_id, last_acknowledged_seq FROM register_predecessor").all(),
    ).toEqual([{ device_id: "first-device", last_acknowledged_seq: 0 }]);
    expect(database.prepare("SELECT register_id FROM awaiting_restored_numbering").all()).toEqual([
      { register_id: "register-1" },
    ]);
    expect(database.prepare("SELECT * FROM awaiting_orphan_sweep").all()).toEqual([
      { register_id: "register-1", from_copy: 0 },
    ]);
  });

  it("holds the first installation's contingency ticket recovery as awaited from the start", async () => {
    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(
      database
        .prepare(
          "SELECT device_id, last_acknowledged_seq FROM awaiting_contingency_ticket_recovery",
        )
        .all(),
    ).toEqual([{ device_id: "first-device", last_acknowledged_seq: 0 }]);
  });

  it("is a no-op the second time", async () => {
    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    const outcome = await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(outcome).toEqual({ kind: "already_reset" });
    expect(database.prepare("SELECT COUNT(*) AS total FROM register_predecessor").get()).toEqual({
      total: 1,
    });
  });

  it("starts the replenishment with no failure left from an earlier restoration", async () => {
    database.exec(
      `INSERT INTO register_predecessor (device_id, last_acknowledged_seq, failure_kind, failure_refusal)
       VALUES ('earlier-device', 3, 'refused', 'predecessor_not_revoked')`,
    );

    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(
      database.prepare("SELECT failure_kind, failure_refusal FROM register_predecessor").all(),
    ).toEqual([{ failure_kind: null, failure_refusal: null }]);
  });

  it("leaves everything as it was when the work fails midway", async () => {
    await expect(
      store.transaction(async (tx) => {
        await tx.recordPredecessor({ deviceId: "first-device", lastAcknowledgedSeq: 0 });
        await tx.adoptInstallationIdentity("new-device");
        throw new Error("interrupted");
      }),
    ).rejects.toThrow("interrupted");

    expect(syncState()).toMatchObject({ device_id: null });
    expect(database.prepare("SELECT COUNT(*) AS total FROM register_predecessor").get()).toEqual({
      total: 0,
    });
  });

  it("holds the register from selling until the replenishment removes the predecessor", async () => {
    await resetSyncIdentityWithoutCopy({ store }, INPUT);
    const evidence = new SqliteRestorationEvidence(
      database,
      restorePendingIn(undefined),
      () => "unknown",
      () => false,
    );

    expect(evidence.evidence()).toMatchObject({ replenish: "pending", origin: "no_copy" });

    database.prepare("DELETE FROM register_predecessor").run();

    expect(evidence.evidence().replenish).toBe("completed");
  });
});
