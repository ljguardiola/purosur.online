import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { startSnapshotCycle } from "./snapshot-cycle-wiring";
import { objectPath, writeManifest } from "./snapshot-generations-folder";
import { FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

const KEY = Buffer.alloc(32, 3).toString("base64");
const REGISTER_ID = "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11";

let folder: string;
let database: LocalDatabase;
let databasePath: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "snapshot-cycle-wiring-"));
  databasePath = join(folder, "register.sqlite");
  database = openLocalDatabase(databasePath, LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare(`INSERT INTO own_register (id, name, version) VALUES ('${REGISTER_ID}', 'Caja 1', 1)`)
    .run();
  database.prepare("UPDATE sync_state SET last_device_seq = 12, pull_cursor = 34").run();
});

afterEach(() => {
  database.close();
  rmSync(folder, { recursive: true, force: true });
});

function start(walSizeBytes = 0, options: { damaged?: boolean; restorePending?: boolean; cloud?: FakeSnapshotCloud } = {}) {
  const cloud = options.cloud ?? new FakeSnapshotCloud();
  const damage: string[] = [];
  const reported: string[] = [];
  const recordedNotices: string[] = [];
  const posted: SnapshotWorkerLaunchRequest[] = [];
  const scheduled: { run: () => Promise<void>; delayMs: number }[] = [];
  const failures: unknown[] = [];
  const schedule = startSnapshotCycle({
    database,
    databasePath,
    snapshotsFolder: join(folder, "snapshots"),
    cloudUrl: "https://cloud.example.test",
    cloud: { cloudUrl: "https://cloud.example.test", fetch: cloud.fetch, sleep: async () => {} },
    readCredentials: async () => ({
      device_id: "device-1",
      device_token: "prefix.secret",
      pepper: "cGVwcGVy",
      keys: {
        snapshot_key_versions: [{ version: 1, key: KEY }],
        contingency_ticket_key: { version: 1, key: KEY },
        outbox_chain_key: KEY,
      },
    }),
    batteryReport: () => ({ present: false }),
    cloudReachability: () => "reachable",
    readStorage: async () => ({
      database_size_bytes: 1,
      wal_size_bytes: walSizeBytes,
      disk_free_bytes: 100 * 1024 * 1024 * 1024,
      disk_free_ratio: 0.5,
    }),
    newGenerationId: () => "0f8fad5b-d9cb-469f-a165-70867728950e",
    postToMain: (message) => posted.push(message),
    scheduleNext: (run, delayMs) => {
      scheduled.push({ run, delayMs });
    },
    localDatabaseDamaged: () => options.damaged ?? false,
    restorePending: () => options.restorePending ?? false,
    health: {
      damageRecorded: async () => false,
      integrityHolds: async () => true,
      recordDamage: async () => {
        damage.push("recorded");
      },
    },
    reports: {
      pending: async () => undefined,
      record: async (stage) => {
        reported.push(stage);
      },
      settle: async () => undefined,
    },
    onCopyFailureRecorded: () => recordedNotices.push("noticed"),
    onFailure: (error) => failures.push(error),
  });
  return { schedule, posted, scheduled, failures, damage, reported, recordedNotices };
}

async function holdEightUploadedGenerations(snapshotsFolder: string): Promise<string[]> {
  mkdirSync(snapshotsFolder);
  const ids = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (hour) => `00000000-0000-4000-8000-${String(hour).padStart(12, "0")}`,
  );
  for (const [index, generationId] of ids.entries()) {
    await writeManifest(snapshotsFolder, {
      generation_id: generationId,
      created_at: new Date(Date.UTC(2026, 9, 15, index + 1)).toISOString(),
      last_device_seq: index,
      pull_cursor: index,
      key_version: 1,
      size: 4,
      sha256: "ab".repeat(32),
      uploaded_at: "2026-10-15T23:00:00.000Z",
      refused_at: null,
    });
  }
  return ids;
}

describe("startSnapshotCycle", () => {
  it("asks main for a worker that takes the first snapshot when its cycle comes", async () => {
    const { posted, scheduled, failures } = start();

    expect(scheduled.map((entry) => entry.delayMs)).toEqual([5 * 60 * 1000]);
    await scheduled[0]?.run();

    expect(failures).toEqual([]);
    expect(posted).toMatchObject([
      {
        type: "launch-snapshot-worker",
        time_limit_ms: 60_000,
        job: {
          kind: "take",
          register_id: REGISTER_ID,
          generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
          key: { version: 1, key: KEY },
          database_path: databasePath,
          snapshots_folder: join(folder, "snapshots"),
          last_device_seq: 12,
          pull_cursor: 34,
        },
      },
    ]);
  });

  it("shrinks the write-ahead log once the worker has exited", () => {
    const { schedule } = start();
    database.pragma("wal_autocheckpoint = 0");
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
    const insert = database.prepare("INSERT INTO notes (body) VALUES (?)");
    for (let index = 0; index < 200; index += 1) {
      insert.run("x".repeat(500));
    }
    expect(statSync(`${databasePath}-wal`).size).toBeGreaterThan(0);

    schedule.workerExited();

    expect(statSync(`${databasePath}-wal`).size).toBe(0);
  });

  it("shrinks the write-ahead log itself when an oversized log made the cycle skip", async () => {
    const { scheduled, posted } = start(257 * 1024 * 1024);
    database.pragma("wal_autocheckpoint = 0");
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
    const insert = database.prepare("INSERT INTO notes (body) VALUES (?)");
    for (let index = 0; index < 200; index += 1) {
      insert.run("x".repeat(500));
    }
    expect(statSync(`${databasePath}-wal`).size).toBeGreaterThan(0);

    await scheduled[0]?.run();

    expect(statSync(`${databasePath}-wal`).size).toBe(0);
    expect(posted).toEqual([]);
  });

  it("records the damage and the report of a copy that failed when its worker exits, then lets the renderer know", async () => {
    const { schedule, damage, reported, recordedNotices, failures } = start();

    await schedule.workerExited("foreign_key_check");

    expect(failures).toEqual([]);
    expect(damage).toEqual(["recorded"]);
    expect(reported).toEqual(["foreign_key_check"]);
    expect(recordedNotices).toEqual(["noticed"]);
  });

  it("records nothing when its worker exits with no copy failure", async () => {
    const { schedule, damage, reported, recordedNotices } = start();

    await schedule.workerExited();

    expect([damage, reported, recordedNotices]).toEqual([[], [], []]);
  });

  it("asks main for no snapshot while the local database is damaged", async () => {
    const { scheduled, posted } = start(0, { damaged: true });

    await scheduled[0]?.run();

    expect(posted).toEqual([]);
  });

  it("asks main for no snapshot while a restore is pending", async () => {
    const { scheduled, posted } = start(0, { restorePending: true });

    await scheduled[0]?.run();

    expect(posted).toEqual([]);
  });

  it("prunes the generations on disk the cloud verified before it decides the cycle", async () => {
    const snapshotsFolder = join(folder, "snapshots");
    const ids = await holdEightUploadedGenerations(snapshotsFolder);
    const cloud = new FakeSnapshotCloud();
    cloud.onVerified = (asked) => Response.json({ verified_generation_ids: asked });
    const { scheduled, posted, failures } = start(0, { cloud });

    await scheduled[0]?.run();

    expect(failures).toEqual([]);
    expect(readdirSync(snapshotsFolder)).not.toContain(`${ids[1]}.json`);
    expect(readdirSync(snapshotsFolder)).toHaveLength(7);
    expect(posted).toMatchObject([{ job: { kind: "take" } }]);
  });

  it("reports a failed pruning and still decides the cycle", async () => {
    const snapshotsFolder = join(folder, "snapshots");
    const ids = await holdEightUploadedGenerations(snapshotsFolder);
    const unremovable = objectPath(snapshotsFolder, ids[1] ?? "");
    mkdirSync(unremovable);
    writeFileSync(join(unremovable, "held"), "x");
    const cloud = new FakeSnapshotCloud();
    cloud.onVerified = (asked) => Response.json({ verified_generation_ids: asked });
    const { scheduled, posted, failures } = start(0, { cloud });

    await scheduled[0]?.run();

    expect(failures).toHaveLength(1);
    expect(posted).toMatchObject([{ job: { kind: "take" } }]);
  });
});
