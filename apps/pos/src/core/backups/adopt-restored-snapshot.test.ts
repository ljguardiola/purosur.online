import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { readOpenSession } from "../register/sqlite-cash-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { adoptStagedSnapshot } from "./adopt-restored-snapshot";
import { restorePendingIn } from "./restore-pending";

const OLD_DEVICE = "old-device";
const NEW_DEVICE = "new-device";
const CHAIN_KEY = Buffer.alloc(32, 9).toString("base64");

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "adopt-restored-snapshot-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function adopt() {
  return adoptStagedSnapshot({
    folder,
    pending: restorePendingIn(folder),
    migrations: LOCAL_MIGRATIONS,
    now: migrationClock,
  });
}

function writeSnapshotDatabase(path: string): void {
  const database = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
  database.exec(`
    UPDATE sync_state SET device_id = '${OLD_DEVICE}', pull_cursor = 77, last_device_seq = 6,
      last_chain_hmac = 'old-chain';
    INSERT INTO users (id, first_name, role_id, active, version) VALUES ('u1', 'Ana', 'r1', 1, 1);
    INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'verifier');
    INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
      VALUES ('session-1', 'register-1', '${OLD_DEVICE}', 'u1', '2026-10-19T08:00:00.000Z', 5000, 'OPEN');
  `);
  for (const deviceSeq of [5, 6]) {
    database
      .prepare(
        `INSERT INTO outbox (
           event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
           payload, occurred_at, actor_id, chain_hmac
         ) VALUES (?, '${OLD_DEVICE}', ?, 'CashSession', 'session-1', 'cash_session_opened', 1, '{}',
                   '2026-10-19T08:00:00.000Z', 'u1', 'chain')`,
      )
      .run(`old-event-${deviceSeq}`, deviceSeq);
  }
  database.close();
}

function stageSnapshot(): void {
  writeSnapshotDatabase(join(folder, "register.restored.sqlite"));
}

async function holdEmptyLiveDatabase(): Promise<void> {
  const database = openLocalDatabase(
    join(folder, "register.sqlite"),
    LOCAL_MIGRATIONS,
    migrationClock,
  );
  database.exec("UPDATE sync_state SET pull_cursor = 1");
  database.close();
}

function liveDatabase() {
  return openLocalDatabase(join(folder, "register.sqlite"), LOCAL_MIGRATIONS, migrationClock);
}

describe("adopting a staged snapshot", () => {
  it("does nothing when no snapshot is staged", async () => {
    await holdEmptyLiveDatabase();
    restorePendingIn(folder).begin(NEW_DEVICE);

    expect(await adopt()).toEqual({ kind: "nothing_staged" });

    expect(restorePendingIn(folder).isPending()).toBe(true);
    const live = liveDatabase();
    expect(live.prepare("SELECT pull_cursor FROM sync_state").get()).toEqual({ pull_cursor: 1 });
    live.close();
  });

  it("replaces the register's database with the snapshot under the new installation's identity", async () => {
    await holdEmptyLiveDatabase();
    stageSnapshot();
    restorePendingIn(folder).begin(NEW_DEVICE);

    expect(await adopt()).toEqual({ kind: "adopted" });

    const live = liveDatabase();
    expect(
      live
        .prepare("SELECT device_id, pull_cursor, last_device_seq, last_chain_hmac FROM sync_state")
        .get(),
    ).toEqual({ device_id: NEW_DEVICE, pull_cursor: 77, last_device_seq: 0, last_chain_hmac: null });
    expect(live.prepare("SELECT device_id, last_acknowledged_seq FROM register_predecessor").all()).toEqual([
      { device_id: OLD_DEVICE, last_acknowledged_seq: 4 },
    ]);
    expect(live.prepare("SELECT COUNT(*) AS total FROM outbox").get()).toEqual({ total: 0 });
    expect(live.prepare("SELECT COUNT(*) AS total FROM pin_verifiers").get()).toEqual({ total: 0 });
    live.close();
  });

  it("resumes the cash session the snapshot left open, neither closing nor discarding it", async () => {
    stageSnapshot();
    restorePendingIn(folder).begin(NEW_DEVICE);

    await adopt();

    const live = liveDatabase();
    expect(readOpenSession(live)).toEqual({
      id: "session-1",
      registerId: "register-1",
      deviceId: OLD_DEVICE,
      openedBy: "u1",
      openedAt: new Date("2026-10-19T08:00:00.000Z"),
      openingFloat: 5000,
      state: "OPEN",
    });
    live.close();
  });

  it("gives the first event of the new installation sequence 1", async () => {
    stageSnapshot();
    restorePendingIn(folder).begin(NEW_DEVICE);
    await adopt();

    const live = liveDatabase();
    appendOutboxEvent(live, CHAIN_KEY, {
      event_id: "018f0000-0000-7000-8000-000000000001",
      aggregate_type: "CashSession",
      aggregate_id: "session-1",
      event_type: "cash_movement_recorded",
      schema_version: 1,
      payload: {},
      occurred_at: "2026-10-19T09:00:00.000Z",
      actor_id: "u1",
    });

    expect(live.prepare("SELECT device_id, device_seq FROM outbox").all()).toEqual([
      { device_id: NEW_DEVICE, device_seq: 1 },
    ]);
    live.close();
  });

  it("clears the pending restore and leaves nothing of the replaced database behind", async () => {
    await holdEmptyLiveDatabase();
    await writeFile(join(folder, "register.sqlite-wal"), "leftover of the replaced database");
    await writeFile(join(folder, "register.sqlite-shm"), "leftover of the replaced database");
    stageSnapshot();
    restorePendingIn(folder).begin(NEW_DEVICE);

    await adopt();

    expect(restorePendingIn(folder).isPending()).toBe(false);
    expect(await readdir(folder)).toEqual(["register.sqlite"]);
  });

  it("finishes the adoption after a crash left the identity already reset but the database not yet replaced", async () => {
    await holdEmptyLiveDatabase();
    stageSnapshot();
    restorePendingIn(folder).begin(NEW_DEVICE);
    const { resetRestoredSyncIdentity } = await import("@purosur/domain/sync/use-cases");
    const { SqliteRestoredSyncIdentityStore } = await import(
      "../sync/sqlite-restored-sync-identity-store"
    );
    const staged = openLocalDatabase(
      join(folder, "register.restored.sqlite"),
      LOCAL_MIGRATIONS,
      migrationClock,
    );
    await resetRestoredSyncIdentity(
      { store: new SqliteRestoredSyncIdentityStore(staged) },
      { deviceId: NEW_DEVICE },
    );
    staged.close();

    expect(await adopt()).toEqual({ kind: "adopted" });

    const live = liveDatabase();
    expect(live.prepare("SELECT device_id, pull_cursor FROM sync_state").get()).toEqual({
      device_id: NEW_DEVICE,
      pull_cursor: 77,
    });
    expect(live.prepare("SELECT COUNT(*) AS total FROM register_predecessor").get()).toEqual({
      total: 1,
    });
    live.close();
  });

  it("migrates a snapshot taken by an older version of the register", async () => {
    const older = LOCAL_MIGRATIONS.slice(0, 30);
    const staged = openLocalDatabase(join(folder, "register.restored.sqlite"), older, migrationClock);
    staged.exec(`UPDATE sync_state SET device_id = '${OLD_DEVICE}', pull_cursor = 5`);
    staged.close();
    restorePendingIn(folder).begin(NEW_DEVICE);

    await adopt();

    const live = liveDatabase();
    expect(live.prepare("SELECT device_id, pull_cursor FROM sync_state").get()).toEqual({
      device_id: NEW_DEVICE,
      pull_cursor: 5,
    });
    live.close();
  });

  it("discards a staged snapshot no restore is pending for", async () => {
    await holdEmptyLiveDatabase();
    stageSnapshot();

    expect(await adopt()).toEqual({ kind: "discarded" });

    expect(existsSync(join(folder, "register.restored.sqlite"))).toBe(false);
    const live = liveDatabase();
    expect(live.prepare("SELECT pull_cursor FROM sync_state").get()).toEqual({ pull_cursor: 1 });
    live.close();
  });
});
