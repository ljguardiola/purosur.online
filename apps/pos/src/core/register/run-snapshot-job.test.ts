import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Durability } from "./durable-files";
import { runSnapshotJob } from "./run-snapshot-job";
import { snapshotAssociatedData } from "./snapshot-encryption";
import { objectPath, readManifests, writeManifest } from "./snapshot-generations-folder";
import { decryptSnapshotFile } from "./test-support/decrypt-snapshot";
import { FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

const NOW = new Date("2026-10-15T13:00:00.000Z");
const KEY = Buffer.alloc(32, 5);
const REGISTER_ID = "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11";
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

let folder: string;
let databasePath: string;
let snapshotsFolder: string;
let live: Database.Database;
let cloud: FakeSnapshotCloud;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "run-snapshot-job-"));
  databasePath = join(folder, "register.sqlite");
  snapshotsFolder = join(folder, "snapshots");
  cloud = new FakeSnapshotCloud();
  live = new Database(databasePath);
  live.pragma("journal_mode = WAL");
  live.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id));
  `);
  const insert = live.prepare("INSERT INTO parents (id, name) VALUES (?, ?)");
  for (let id = 1; id <= 100; id += 1) {
    insert.run(id, `parent ${id} ${"x".repeat(100)}`);
  }
});

afterEach(async () => {
  live.close();
  await rm(folder, { recursive: true, force: true });
});

type TakeJob = Extract<SnapshotWorkerJobMessage, { kind: "take" }>;

function takeJob(overrides: Partial<TakeJob> = {}): TakeJob {
  return {
    kind: "take",
    register_id: REGISTER_ID,
    generation_id: GENERATION_ID,
    key: { version: 2, key: KEY.toString("base64") },
    device_token: "prefix.secret",
    cloud_url: "https://cloud.example.test",
    database_path: databasePath,
    snapshots_folder: snapshotsFolder,
    last_device_seq: 41,
    pull_cursor: 977,
    ...overrides,
  };
}

function uploadJob(): SnapshotWorkerJobMessage {
  return {
    kind: "upload_pending",
    device_token: "prefix.secret",
    cloud_url: "https://cloud.example.test",
    snapshots_folder: snapshotsFolder,
  };
}

function run(job: SnapshotWorkerJobMessage, durability?: Durability) {
  return runSnapshotJob(job, {
    cloud: { cloudUrl: job.cloud_url, fetch: cloud.fetch, sleep: async () => {} },
    now: () => NOW,
    ...(durability === undefined ? {} : { durability }),
  });
}

describe("runSnapshotJob that takes a snapshot", () => {
  it("leaves the encrypted generation and its manifest in the snapshots folder", async () => {
    const result = await run(takeJob());

    const [manifest] = await readManifests(snapshotsFolder);
    const object = await readFile(objectPath(snapshotsFolder, GENERATION_ID));
    expect(manifest).toEqual({
      generation_id: GENERATION_ID,
      created_at: NOW.toISOString(),
      last_device_seq: 41,
      pull_cursor: 977,
      key_version: 2,
      size: object.length,
      sha256: createHash("sha256").update(object).digest("hex"),
      uploaded_at: NOW.toISOString(),
      refused_at: null,
    });
    expect(result).toEqual({
      kind: "completed",
      uploads: { uploaded: 1, refused: 0, failed: 0 },
    });
  });

  it("encrypts a copy of the database that only opens with the register, key version and generation", async () => {
    await run(takeJob());

    const identity = { registerId: REGISTER_ID, keyVersion: 2, generationId: GENERATION_ID };
    const copy = await decryptSnapshotFile(
      objectPath(snapshotsFolder, GENERATION_ID),
      KEY,
      snapshotAssociatedData(identity),
    );
    const copyPath = join(folder, "restored.sqlite");
    await writeFile(copyPath, copy);
    const restored = new Database(copyPath, { readonly: true });
    expect(restored.prepare("SELECT count(*) AS total FROM parents").get()).toEqual({
      total: 100,
    });
    restored.close();
    await expect(
      decryptSnapshotFile(
        objectPath(snapshotsFolder, GENERATION_ID),
        KEY,
        snapshotAssociatedData({ ...identity, registerId: "someone-else" }),
      ),
    ).rejects.toThrow();
  });

  it("declares the hash of the encrypted object, size and key version before uploading it", async () => {
    await run(takeJob());

    const object = await readFile(objectPath(snapshotsFolder, GENERATION_ID));
    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put", "uploaded"]);
    expect(cloud.calls[0]).toMatchObject({
      body: {
        generation_id: GENERATION_ID,
        size: object.length,
        sha256: createHash("sha256").update(object).digest("hex"),
        key_version: 2,
      },
    });
    expect(cloud.calls[1]).toMatchObject({ body: object });
  });

  it("leaves no plain copy or temporary file behind", async () => {
    await run(takeJob());

    expect((await readdir(snapshotsFolder)).sort()).toEqual([
      `${GENERATION_ID}.json`,
      `${GENERATION_ID}.snapshot`,
    ]);
  });

  it("removes what an earlier killed run left in the folder first", async () => {
    await mkdir(snapshotsFolder);
    await writeFile(join(snapshotsFolder, "killed.sqlite.tmp"), "partial");
    await writeFile(join(snapshotsFolder, "orphan.snapshot"), "partial");

    await run(takeJob());

    const names = await readdir(snapshotsFolder);
    expect(names).not.toContain("killed.sqlite.tmp");
    expect(names).not.toContain("orphan.snapshot");
  });

  it("flushes the copy, then the encrypted object, then the manifest, each with the folder", async () => {
    const steps: string[] = [];
    const durability: Durability = {
      file: async (path) => {
        steps.push(`file ${basename(path).replace(GENERATION_ID, "id")}`);
      },
      folder: async () => {
        steps.push("folder");
      },
    };

    await run(takeJob(), durability);

    expect(steps).toEqual([
      "file id.sqlite.tmp",
      "folder",
      "file id.snapshot.tmp",
      "folder",
      "file id.json.tmp",
      "folder",
      "file id.json.tmp",
      "folder",
    ]);
  });

  it("keeps the generation pending when the cloud cannot be reached", async () => {
    cloud.onDeclare = () => "unreachable";

    const result = await run(takeJob());

    expect(result).toEqual({
      kind: "completed",
      uploads: { uploaded: 0, refused: 0, failed: 1 },
    });
    expect(await readManifests(snapshotsFolder)).toMatchObject([
      { generation_id: GENERATION_ID, uploaded_at: null },
    ]);
  });

  it("aborts without a manifest or any call to the cloud when the copy has a dangling foreign key", async () => {
    live.exec(
      "CREATE TABLE orphans (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id))",
    );
    live.pragma("foreign_keys = OFF");
    live.prepare("INSERT INTO orphans (id, parent_id) VALUES (1, 999)").run();

    const result = await run(takeJob());

    expect(result).toEqual({ kind: "aborted", stage: "foreign_key_check" });
    expect(await readdir(snapshotsFolder)).toEqual([]);
    expect(cloud.calls).toEqual([]);
  });

  it("aborts at the copy when the database is missing", async () => {
    const result = await run(takeJob({ database_path: join(folder, "missing.sqlite") }));

    expect(result).toEqual({ kind: "aborted", stage: "copy" });
    expect(await readdir(snapshotsFolder)).toEqual([]);
    expect(cloud.calls).toEqual([]);
  });
});

describe("runSnapshotJob that only uploads", () => {
  it("uploads the generations waiting and takes no new snapshot", async () => {
    const waiting = "00000000-0000-4000-8000-000000000001";
    await mkdir(snapshotsFolder);
    await writeManifest(snapshotsFolder, {
      generation_id: waiting,
      created_at: "2026-10-15T11:00:00.000Z",
      last_device_seq: 1,
      pull_cursor: 1,
      key_version: 2,
      size: 5,
      sha256: "ab".repeat(32),
      uploaded_at: null,
      refused_at: null,
    });
    await writeFile(objectPath(snapshotsFolder, waiting), "bytes");

    const result = await run(uploadJob());

    expect(result).toEqual({
      kind: "completed",
      uploads: { uploaded: 1, refused: 0, failed: 0 },
    });
    expect((await readManifests(snapshotsFolder)).map((entry) => entry.generation_id)).toEqual([
      waiting,
    ]);
    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put", "uploaded"]);
  });
});
