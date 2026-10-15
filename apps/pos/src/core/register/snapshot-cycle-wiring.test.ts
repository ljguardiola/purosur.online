import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { startSnapshotCycle } from "./snapshot-cycle-wiring";

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

function start(walSizeBytes = 0) {
  const posted: SnapshotWorkerLaunchRequest[] = [];
  const scheduled: { run: () => Promise<void>; delayMs: number }[] = [];
  const failures: unknown[] = [];
  const schedule = startSnapshotCycle({
    database,
    databasePath,
    snapshotsFolder: join(folder, "snapshots"),
    cloudUrl: "https://cloud.example.test",
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
    onFailure: (error) => failures.push(error),
  });
  return { schedule, posted, scheduled, failures };
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
});
