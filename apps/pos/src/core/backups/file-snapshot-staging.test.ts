import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Durability } from "../register/durable-files";
import { createFileSnapshotStaging } from "./file-snapshot-staging";
import {
  downloadUrlOf,
  type EncryptedSnapshot,
  encryptedSnapshot,
  FakeRestorableCloud,
  sha256Of,
} from "./test-support/restorable-snapshot-cloud";
import {
  brokenForeignKeySqliteBytes,
  validSqliteBytes,
} from "./test-support/sqlite-fixtures";

const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const KEY = Buffer.alloc(32, 5);
const OTHER_KEY = Buffer.alloc(32, 6);
const CREATED_AT = "2026-10-15T12:00:00.000Z";

let folder: string;
let stagedPath: string;
let cloud: FakeRestorableCloud;
let flushed: string[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "file-snapshot-staging-"));
  stagedPath = join(folder, "register.restored.sqlite");
  cloud = new FakeRestorableCloud();
  flushed = [];
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function stage(
  snapshot: EncryptedSnapshot,
  options: { keys?: { version: number; key: Buffer }[]; generation?: Partial<{ sha256: string; size: number }> } = {},
) {
  cloud.snapshots = [snapshot];
  const durability: Durability = {
    file: async (path) => void flushed.push(`file ${path}`),
    folder: async (path) => void flushed.push(`folder ${path}`),
  };
  const staging = createFileSnapshotStaging({
    fetch: cloud.fetch,
    downloadUrlOf,
    keys: options.keys ?? [{ version: 2, key: KEY }],
    stagedPath,
    durability,
  });
  return staging.stage({
    generationId: snapshot.generationId,
    registerId: "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
    createdAt: new Date(snapshot.createdAt),
    size: snapshot.size,
    sha256: snapshot.sha256,
    keyVersion: snapshot.keyVersion,
    ...options.generation,
  });
}

function snapshotOf(database: Buffer, overrides: { keyVersion?: number; key?: Buffer } = {}) {
  return encryptedSnapshot({
    database,
    generationId: GENERATION_ID,
    keyVersion: overrides.keyVersion ?? 2,
    key: overrides.key ?? KEY,
    createdAt: CREATED_AT,
  });
}

async function leftInFolder(): Promise<string[]> {
  return (await readdir(folder)).sort();
}

describe("staging a snapshot generation", () => {
  it("leaves the decrypted database at the staged path, flushed with its folder", async () => {
    const database = validSqliteBytes();

    const answer = await stage(await snapshotOf(database));

    expect(answer).toEqual({ kind: "staged" });
    expect(await readFile(stagedPath)).toEqual(database);
    expect(await leftInFolder()).toEqual(["register.restored.sqlite"]);
    expect(flushed).toEqual([`file ${stagedPath}`, `folder ${folder}`]);
  });

  it("decrypts with the key of the version the generation was encrypted with", async () => {
    const database = validSqliteBytes();
    const snapshot = await snapshotOf(database, { keyVersion: 1, key: OTHER_KEY });

    const answer = await stage(snapshot, {
      keys: [
        { version: 2, key: KEY },
        { version: 1, key: OTHER_KEY },
      ],
    });

    expect(answer).toEqual({ kind: "staged" });
  });

  it("fails at the download when the object cannot be fetched", async () => {
    cloud.objectAnswer = "unreachable";

    expect(await stage(await snapshotOf(validSqliteBytes()))).toEqual({
      kind: "failed",
      stage: "download",
    });
    expect(await leftInFolder()).toEqual([]);
  });

  it("fails at the download when the storage refuses the object", async () => {
    cloud.objectAnswer = "missing";

    expect(await stage(await snapshotOf(validSqliteBytes()))).toEqual({
      kind: "failed",
      stage: "download",
    });
  });

  it("fails at the download when the cloud never named where to download from", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());
    const staging = createFileSnapshotStaging({
      fetch: cloud.fetch,
      downloadUrlOf: () => undefined,
      keys: [{ version: 2, key: KEY }],
      stagedPath,
    });

    const answer = await staging.stage({
      generationId: snapshot.generationId,
      registerId: "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
      createdAt: new Date(snapshot.createdAt),
      size: snapshot.size,
      sha256: snapshot.sha256,
      keyVersion: 2,
    });

    expect(answer).toEqual({ kind: "failed", stage: "download" });
  });

  it("fails on a hash mismatch when the object differs from the one the cloud described", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());
    const answer = await stage(snapshot, { generation: { sha256: "cd".repeat(32) } });

    expect(answer).toEqual({ kind: "failed", stage: "hash_mismatch" });
    expect(await leftInFolder()).toEqual([]);
  });

  it("fails on a hash mismatch when the object has another size than the cloud described", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());

    const answer = await stage(snapshot, { generation: { size: snapshot.size + 1 } });

    expect(answer).toEqual({ kind: "failed", stage: "hash_mismatch" });
  });

  it("fails on a missing key version when the installation holds no key of the generation's version", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());

    const answer = await stage(snapshot, { keys: [{ version: 1, key: KEY }] });

    expect(answer).toEqual({ kind: "failed", stage: "missing_key_version" });
    expect(await leftInFolder()).toEqual([]);
  });

  it("fails at the decryption when the ciphertext was tampered with, even if its hash was described to match", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());
    const tampered = Buffer.from(snapshot.object);
    tampered[20] = (tampered[20] ?? 0) ^ 1;
    cloud.tampered.set(GENERATION_ID, tampered);

    const answer = await stage({ ...snapshot, sha256: sha256Of(tampered) });

    expect(answer).toEqual({ kind: "failed", stage: "decryption" });
    expect(await leftInFolder()).toEqual([]);
  });

  it("fails at the decryption when the key is not the one the generation was encrypted with", async () => {
    const snapshot = await snapshotOf(validSqliteBytes());

    const answer = await stage(snapshot, { keys: [{ version: 2, key: OTHER_KEY }] });

    expect(answer).toEqual({ kind: "failed", stage: "decryption" });
  });

  it("fails at the decryption when the generation belongs to another register", async () => {
    const snapshot = await encryptedSnapshot({
      database: validSqliteBytes(),
      generationId: GENERATION_ID,
      keyVersion: 2,
      key: KEY,
      createdAt: CREATED_AT,
      registerId: "11111111-1111-4111-8111-111111111111",
    });

    expect(await stage(snapshot)).toEqual({ kind: "failed", stage: "decryption" });
  });

  it("fails the integrity check when the decrypted file is not a database, and removes it", async () => {
    const snapshot = await snapshotOf(Buffer.from("this is not a sqlite database".repeat(40)));

    const answer = await stage(snapshot);

    expect(answer).toEqual({ kind: "failed", stage: "integrity_check" });
    expect(existsSync(stagedPath)).toBe(false);
    expect(await leftInFolder()).toEqual([]);
  });

  it("fails the foreign key check when the decrypted database breaks one, and removes it", async () => {
    const answer = await stage(await snapshotOf(brokenForeignKeySqliteBytes()));

    expect(answer).toEqual({ kind: "failed", stage: "foreign_key_check" });
    expect(await leftInFolder()).toEqual([]);
  });

  it("replaces what an earlier attempt left at the staged path", async () => {
    await stage(await snapshotOf(Buffer.from("garbage".repeat(100))));
    const database = validSqliteBytes();

    const answer = await stage(await snapshotOf(database));

    expect(answer).toEqual({ kind: "staged" });
    const staged = new Database(stagedPath, { readonly: true });
    expect(staged.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    staged.close();
  });
});
