import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRestoreJob } from "./run-restore-job";
import {
  CLOUD_URL,
  DEVICE_TOKEN,
  encryptedSnapshot,
  FakeRestorableCloud,
  sha256Of,
} from "./test-support/restorable-snapshot-cloud";
import { sqliteFileBytes, validSqliteBytes } from "./test-support/sqlite-fixtures";

const KEY = Buffer.alloc(32, 5);
const OLDER_ID = "00000000-0000-4000-8000-000000000001";
const NEWER_ID = "00000000-0000-4000-8000-000000000002";

let folder: string;
let stagedPath: string;
let cloud: FakeRestorableCloud;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "run-restore-job-"));
  stagedPath = join(folder, "register.restored.sqlite");
  cloud = new FakeRestorableCloud();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

type RestoreJob = Extract<SnapshotWorkerJobMessage, { kind: "restore" }>;

function job(): RestoreJob {
  return {
    kind: "restore",
    device_token: DEVICE_TOKEN,
    cloud_url: CLOUD_URL,
    staged_database_path: stagedPath,
    snapshot_keys: [{ version: 2, key: KEY.toString("base64") }],
  };
}

function run() {
  return runRestoreJob(job(), {
    cloud: { cloudUrl: CLOUD_URL, fetch: cloud.fetch, sleep: async () => {} },
  });
}

function generation(generationId: string, createdAt: string, database: Buffer) {
  return encryptedSnapshot({ database, generationId, keyVersion: 2, key: KEY, createdAt });
}

describe("the restore job", () => {
  it("stages the newest generation the cloud lists", async () => {
    const newest = sqliteFileBytes((database) => {
      database.exec("CREATE TABLE newest (id INTEGER PRIMARY KEY)");
    });
    cloud.snapshots = [
      await generation(OLDER_ID, "2026-10-15T10:00:00.000Z", validSqliteBytes()),
      await generation(NEWER_ID, "2026-10-15T12:00:00.000Z", newest),
    ];

    const outcome = await run();

    expect(outcome).toEqual({ kind: "restored", generationId: NEWER_ID, failures: [] });
    expect(await readFile(stagedPath)).toEqual(newest);
  });

  it("falls back to the next newest generation when the newest cannot be used, naming why", async () => {
    const older = validSqliteBytes();
    const newer = await generation(NEWER_ID, "2026-10-15T12:00:00.000Z", validSqliteBytes());
    const tampered = Buffer.from(newer.object);
    tampered[20] = (tampered[20] ?? 0) ^ 1;
    cloud.tampered.set(NEWER_ID, tampered);
    cloud.snapshots = [
      await generation(OLDER_ID, "2026-10-15T10:00:00.000Z", older),
      { ...newer, sha256: sha256Of(tampered) },
    ];

    const outcome = await run();

    expect(outcome).toEqual({
      kind: "restored",
      generationId: OLDER_ID,
      failures: [{ generationId: NEWER_ID, stage: "decryption" }],
    });
    expect(await readFile(stagedPath)).toEqual(older);
  });

  it("finds nothing to restore when the cloud holds no generation, staging nothing", async () => {
    expect(await run()).toEqual({ kind: "no_generation" });
    expect(existsSync(stagedPath)).toBe(false);
  });

  it("finds no usable generation when every one fails, staging nothing", async () => {
    cloud.snapshots = [await generation(OLDER_ID, "2026-10-15T10:00:00.000Z", validSqliteBytes())];
    cloud.objectAnswer = "unreachable";

    expect(await run()).toEqual({
      kind: "none_usable",
      failures: [{ generationId: OLDER_ID, stage: "download" }],
    });
    expect(existsSync(stagedPath)).toBe(false);
  });

  it("is unreachable when the cloud cannot be asked", async () => {
    cloud.listing = "unreachable";

    expect(await run()).toEqual({ kind: "unreachable" });
  });
});
