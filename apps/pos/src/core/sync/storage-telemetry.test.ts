import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  nodeStorageFileSystem,
  type StorageFileSystem,
  storageTelemetryReader,
} from "./storage-telemetry";

function fileSystemWith(
  sizes: Record<string, number>,
  capacity: { availableBytes: number; totalBytes: number },
): StorageFileSystem & { measured: string[] } {
  const measured: string[] = [];
  return {
    measured,
    sizeOf: async (path) => sizes[path],
    capacityOf: async (path) => {
      measured.push(path);
      return capacity;
    },
  };
}

describe("the register's storage telemetry", () => {
  it("reads the size of the database's write-ahead log and the free space of its volume", async () => {
    const fileSystem = fileSystemWith(
      { "/data/register.sqlite-wal": 8192 },
      { availableBytes: 25_000, totalBytes: 100_000 },
    );

    const telemetry = await storageTelemetryReader("/data/register.sqlite", fileSystem)();

    expect(telemetry).toEqual({
      wal_size_bytes: 8192,
      disk_free_bytes: 25_000,
      disk_free_ratio: 0.25,
    });
    expect(fileSystem.measured).toEqual(["/data/register.sqlite"]);
  });

  it("counts a write-ahead log that doesn't exist as empty", async () => {
    const fileSystem = fileSystemWith({}, { availableBytes: 1, totalBytes: 2 });

    const telemetry = await storageTelemetryReader("/data/register.sqlite", fileSystem)();

    expect(telemetry.wal_size_bytes).toBe(0);
  });

  it("reads no free space ratio from a volume that reports no size", async () => {
    const fileSystem = fileSystemWith({}, { availableBytes: 0, totalBytes: 0 });

    const telemetry = await storageTelemetryReader("/data/register.sqlite", fileSystem)();

    expect(telemetry.disk_free_ratio).toBe(0);
  });

  it("never reports more free space than the volume holds", async () => {
    const fileSystem = fileSystemWith({}, { availableBytes: 3, totalBytes: 2 });

    const telemetry = await storageTelemetryReader("/data/register.sqlite", fileSystem)();

    expect(telemetry.disk_free_ratio).toBe(1);
  });
});

describe("the computer's file system", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "register-storage-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true });
  });

  it("measures the size of a file, and finds none for a file that doesn't exist", async () => {
    await writeFile(join(folder, "register.sqlite-wal"), "12345");

    expect(await nodeStorageFileSystem.sizeOf(join(folder, "register.sqlite-wal"))).toBe(5);
    expect(await nodeStorageFileSystem.sizeOf(join(folder, "missing"))).toBeUndefined();
  });

  it("measures the space available to the user on the volume holding a path", async () => {
    const { availableBytes, totalBytes } = await nodeStorageFileSystem.capacityOf(folder);

    expect(Number.isInteger(availableBytes)).toBe(true);
    expect(availableBytes).toBeGreaterThanOrEqual(0);
    expect(totalBytes).toBeGreaterThan(0);
    expect(availableBytes).toBeLessThanOrEqual(totalBytes);
  });
});
