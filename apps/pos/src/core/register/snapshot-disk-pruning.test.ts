import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SNAPSHOT_VERIFICATION_QUERY_LIMIT, type SnapshotManifest } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Durability } from "./durable-files";
import {
  cloudSnapshotVerification,
  folderSnapshotGenerationsOnDisk,
  pruneSnapshotsOnDisk,
} from "./snapshot-disk-pruning";
import { objectPath, readGenerations, writeManifest } from "./snapshot-generations-folder";
import { cloudRefusal, FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

const GIGABYTE = 1024 * 1024 * 1024;
const CLOUD_URL = "https://cloud.example.test";
const DEVICE_TOKEN = "prefix.secret";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-disk-pruning-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function idOf(hour: number): string {
  return `00000000-0000-4000-8000-${String(hour).padStart(12, "0")}`;
}

function manifest(hour: number): SnapshotManifest {
  return {
    generation_id: idOf(hour),
    created_at: new Date(Date.UTC(2026, 9, 15, hour)).toISOString(),
    last_device_seq: hour,
    pull_cursor: hour,
    key_version: 1,
    size: 4,
    sha256: "ab".repeat(32),
    uploaded_at: "2026-10-15T23:00:00.000Z",
    refused_at: null,
  };
}

async function hold(...hours: number[]): Promise<void> {
  for (const hour of hours) {
    await writeManifest(folder, manifest(hour));
    await writeFile(objectPath(folder, idOf(hour)), "encrypted");
  }
}

async function heldHours(): Promise<number[]> {
  return (await readGenerations(folder))
    .map((generation) => generation.createdAt.getUTCHours())
    .sort((a, b) => a - b);
}

function storage(diskFreeRatio = 0.5, diskFreeBytes = 100 * GIGABYTE) {
  return async () => ({
    database_size_bytes: 1,
    wal_size_bytes: 0,
    disk_free_bytes: diskFreeBytes,
    disk_free_ratio: diskFreeRatio,
  });
}

function cloudOf(fake: FakeSnapshotCloud) {
  return { cloudUrl: CLOUD_URL, fetch: fake.fetch, sleep: async () => {} };
}

describe("folderSnapshotGenerationsOnDisk", () => {
  it("removes a generation's manifest and object, leaving the others", async () => {
    await hold(1, 2);
    const disk = folderSnapshotGenerationsOnDisk(folder, storage());
    const [first] = (await disk.generations()).filter(
      (generation) => generation.generationId === idOf(1),
    );

    await disk.remove(first ?? expect.unreachable());

    expect((await readdir(folder)).sort()).toEqual([`${idOf(2)}.json`, `${idOf(2)}.snapshot`]);
  });

  it("forgets the manifest durably before the object goes", async () => {
    await hold(1);
    const steps: string[] = [];
    const durability: Durability = {
      file: async () => {},
      folder: async () => {
        steps.push(
          `folder synced, object ${existsSync(objectPath(folder, idOf(1))) ? "kept" : "gone"}`,
        );
      },
    };
    const disk = folderSnapshotGenerationsOnDisk(folder, storage(), durability);
    const [first] = await disk.generations();

    await disk.remove(first ?? expect.unreachable());

    expect(steps).toEqual(["folder synced, object kept"]);
    expect(await readdir(folder)).toEqual([]);
  });

  it("removes a generation whose object is already gone", async () => {
    await writeManifest(folder, manifest(1));
    const disk = folderSnapshotGenerationsOnDisk(folder, storage());
    const [first] = await disk.generations();

    await disk.remove(first ?? expect.unreachable());

    expect(await readdir(folder)).toEqual([]);
  });

  it("reads the free space of the disk", async () => {
    const disk = folderSnapshotGenerationsOnDisk(folder, storage(0.12, 7 * GIGABYTE));

    expect(await disk.space()).toEqual({ diskFreeBytes: 7 * GIGABYTE, diskFreeRatio: 0.12 });
  });
});

describe("cloudSnapshotVerification", () => {
  it("asks the cloud about the generations with the device token and reads its answer", async () => {
    const fake = new FakeSnapshotCloud();
    fake.onVerified = (ids) => Response.json({ verified_generation_ids: ids.slice(0, 1) });

    const answer = await cloudSnapshotVerification(cloudOf(fake), DEVICE_TOKEN).verifiedAmong([
      idOf(1),
      idOf(2),
    ]);

    expect(answer).toEqual({ kind: "answered", verifiedGenerationIds: [idOf(1)] });
    expect(fake.calls).toEqual([
      {
        kind: "verified",
        authorization: `Bearer ${DEVICE_TOKEN}`,
        generationIds: [idOf(1), idOf(2)],
      },
    ]);
  });

  it("asks about many generations a limited number at a time", async () => {
    const fake = new FakeSnapshotCloud();
    fake.onVerified = (ids) => Response.json({ verified_generation_ids: ids });
    const ids = Array.from({ length: SNAPSHOT_VERIFICATION_QUERY_LIMIT + 1 }, (_, index) =>
      idOf(index),
    );

    const answer = await cloudSnapshotVerification(cloudOf(fake), DEVICE_TOKEN).verifiedAmong(ids);

    expect(answer).toEqual({ kind: "answered", verifiedGenerationIds: ids });
    expect(
      fake.calls.map((call) => (call.kind === "verified" ? call.generationIds.length : 0)),
    ).toEqual([SNAPSHOT_VERIFICATION_QUERY_LIMIT, 1]);
  });

  it.each([
    ["the cloud cannot be reached", (): Response | "unreachable" => "unreachable"],
    ["the cloud refuses", () => cloudRefusal("snapshot_backups_unavailable", 503)],
    ["the answer is not the expected shape", () => Response.json({ verified: [] })],
  ])("answers nothing when %s", async (_, onVerified) => {
    const fake = new FakeSnapshotCloud();
    fake.onVerified = onVerified;

    const answer = await cloudSnapshotVerification(cloudOf(fake), DEVICE_TOKEN).verifiedAmong([
      idOf(1),
    ]);

    expect(answer).toEqual({ kind: "unanswered" });
  });

  it("answers nothing when a later part of a long question fails", async () => {
    const fake = new FakeSnapshotCloud();
    let asked = 0;
    fake.onVerified = (ids) => {
      asked += 1;
      return asked === 1 ? Response.json({ verified_generation_ids: ids }) : "unreachable";
    };
    const ids = Array.from({ length: SNAPSHOT_VERIFICATION_QUERY_LIMIT + 1 }, (_, index) =>
      idOf(index),
    );

    expect(await cloudSnapshotVerification(cloudOf(fake), DEVICE_TOKEN).verifiedAmong(ids)).toEqual(
      { kind: "unanswered" },
    );
  });
});

describe("pruneSnapshotsOnDisk", () => {
  function credentials() {
    return async () => ({ device_id: "device-1", device_token: DEVICE_TOKEN, pepper: "cGVwcGVy" });
  }

  it("removes the generations beyond the last six that the cloud verified", async () => {
    await hold(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const fake = new FakeSnapshotCloud();
    fake.onVerified = () => Response.json({ verified_generation_ids: [idOf(2), idOf(3)] });

    const outcome = await pruneSnapshotsOnDisk({
      snapshotsFolder: folder,
      readStorage: storage(),
      readCredentials: credentials(),
      cloud: cloudOf(fake),
    });

    expect(outcome).toEqual({ kind: "pruned", removed: [idOf(3), idOf(2)] });
    expect(await heldHours()).toEqual([1, 4, 5, 6, 7, 8, 9]);
  });

  it.each([
    ["without credentials", { readCredentials: async () => undefined }],
    ["without a cloud", { cloud: undefined }],
  ])("counts no generation as verified %s", async (_, overrides) => {
    await hold(1, 2, 3, 4, 5, 6, 7, 8);
    const fake = new FakeSnapshotCloud();
    fake.onVerified = (ids) => Response.json({ verified_generation_ids: ids });

    const outcome = await pruneSnapshotsOnDisk({
      snapshotsFolder: folder,
      readStorage: storage(),
      readCredentials: credentials(),
      cloud: cloudOf(fake),
      ...overrides,
    });

    expect(outcome).toEqual({ kind: "verification_unanswered", removed: [] });
    expect(await heldHours()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fake.calls).toEqual([]);
  });

  it("finds nothing to prune in a folder not created yet", async () => {
    const outcome = await pruneSnapshotsOnDisk({
      snapshotsFolder: join(folder, "missing"),
      readStorage: storage(0.08),
      readCredentials: credentials(),
      cloud: undefined,
    });

    expect(outcome).toEqual({ kind: "pruned", removed: [] });
  });
});
