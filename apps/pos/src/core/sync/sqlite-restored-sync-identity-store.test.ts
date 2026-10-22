import { resetRestoredSyncIdentity } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import { SqliteRestoredSyncIdentityStore } from "./sqlite-restored-sync-identity-store";

const OLD_DEVICE = "old-device";
const NEW_DEVICE = "new-device";

let database: LocalDatabase;
let store: SqliteRestoredSyncIdentityStore;

function insertOutboxEvent(deviceSeq: number, acknowledged: boolean): void {
  database
    .prepare(
      `INSERT INTO outbox (
         event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
         payload, occurred_at, actor_id, chain_hmac, acked_at
       ) VALUES (?, ?, ?, 'CashSession', 'session-1', 'cash_session_opened', 1, '{}',
                 '2026-10-01T12:00:00.000Z', 'u1', 'chain', ?)`,
    )
    .run(
      `event-${deviceSeq}`,
      OLD_DEVICE,
      deviceSeq,
      acknowledged ? "2026-10-01T12:05:00.000Z" : null,
    );
}

function carryOldInstallation(lastDeviceSeq: number): void {
  database
    .prepare(
      `UPDATE sync_state SET
         device_id = ?, pull_cursor = 42, last_device_seq = ?, last_chain_hmac = 'old-chain',
         installation_revoked_at = '2026-10-02T00:00:00.000Z', sales_stopped_reason = 'installation_revoked',
         last_accepted_push_at = '2026-10-01T12:05:00.000Z'`,
    )
    .run(OLD_DEVICE, lastDeviceSeq);
}

function syncState() {
  return database
    .prepare(
      `SELECT device_id, pull_cursor, last_device_seq, last_chain_hmac, installation_revoked_at,
              sales_stopped_reason, last_accepted_push_at
         FROM sync_state`,
    )
    .get();
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT COUNT(*) AS total FROM ${table}`).get()
    ?.total as number;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  store = new SqliteRestoredSyncIdentityStore(database);
});

afterEach(() => {
  database.close();
});

describe("the restored sync identity store", () => {
  it("reads the carried device and the sequence the cloud acknowledged when the outbox still holds acknowledged events", async () => {
    carryOldInstallation(5);
    for (const deviceSeq of [1, 2, 3]) {
      insertOutboxEvent(deviceSeq, true);
    }
    for (const deviceSeq of [4, 5]) {
      insertOutboxEvent(deviceSeq, false);
    }

    const carried = await store.transaction((tx) => tx.carriedIdentity());

    expect(carried).toEqual({ deviceId: OLD_DEVICE, lastAcknowledgedSeq: 3 });
  });

  it("reads the acknowledged sequence from the first unacknowledged event once acknowledged ones are pruned", async () => {
    carryOldInstallation(9);
    for (const deviceSeq of [7, 8, 9]) {
      insertOutboxEvent(deviceSeq, false);
    }

    const carried = await store.transaction((tx) => tx.carriedIdentity());

    expect(carried.lastAcknowledgedSeq).toBe(6);
  });

  it("reads every event as acknowledged when none is waiting in the outbox", async () => {
    carryOldInstallation(9);

    const carried = await store.transaction((tx) => tx.carriedIdentity());

    expect(carried.lastAcknowledgedSeq).toBe(9);
  });

  it("resets the identity, records the predecessor and discards what the snapshot carried, in one step", async () => {
    carryOldInstallation(5);
    insertOutboxEvent(4, true);
    insertOutboxEvent(5, false);
    database.exec(`
      INSERT INTO users (id, first_name, role_id, active, version) VALUES ('u1', 'Ana', 'r1', 1, 1);
      INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'verifier');
      INSERT INTO pin_sign_in_failures (user_id, consecutive_failures, last_failed_at)
        VALUES ('u1', 2, '2026-10-01T10:00:00.000Z');
    `);

    const outcome = await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(outcome).toEqual({
      kind: "reset",
      predecessorDeviceId: OLD_DEVICE,
      lastAcknowledgedSeq: 4,
    });
    expect(syncState()).toEqual({
      device_id: NEW_DEVICE,
      pull_cursor: 42,
      last_device_seq: 0,
      last_chain_hmac: null,
      installation_revoked_at: null,
      sales_stopped_reason: null,
      last_accepted_push_at: null,
    });
    expect(database.prepare("SELECT * FROM register_predecessor").all()).toEqual([
      { device_id: OLD_DEVICE, last_acknowledged_seq: 4 },
    ]);
    expect(count("outbox")).toBe(0);
    expect(count("pin_verifiers")).toBe(0);
    expect(count("pin_sign_in_failures")).toBe(0);
    expect(count("users")).toBe(1);
  });

  it("leaves the new installation no enrollment pending from the old one's stale sequence", async () => {
    carryOldInstallation(5);
    database
      .prepare("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-01T09:30:00.000Z'")
      .run();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    const evidence = new SqliteRestorationEvidence(database, restorePendingIn(undefined));
    expect(evidence.evidence().enroll).toBe("completed");
  });

  it("leaves the register as it is when the identity already is the new installation's", async () => {
    carryOldInstallation(5);
    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    const outcome = await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(outcome).toEqual({ kind: "already_reset" });
    expect(count("register_predecessor")).toBe(1);
  });

  it("leaves everything as it was when the work fails midway", async () => {
    carryOldInstallation(5);
    insertOutboxEvent(5, false);
    const before = syncState();

    await expect(
      store.transaction(async (tx) => {
        await tx.recordPredecessor({ deviceId: OLD_DEVICE, lastAcknowledgedSeq: 4 });
        await tx.discardCarriedOutboxEvents();
        await tx.adoptInstallationIdentity(NEW_DEVICE);
        throw new Error("the work failed");
      }),
    ).rejects.toThrow("the work failed");

    expect(syncState()).toEqual(before);
    expect(count("outbox")).toBe(1);
    expect(count("register_predecessor")).toBe(0);
  });

  it("lets the next event of the new installation take sequence 1", async () => {
    carryOldInstallation(5);
    insertOutboxEvent(5, false);

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    const next = database
      .prepare<[], { device_id: string; last_device_seq: number }>(
        "SELECT device_id, last_device_seq + 1 AS last_device_seq FROM sync_state",
      )
      .get();
    expect(next).toEqual({ device_id: NEW_DEVICE, last_device_seq: 1 });
  });
});
