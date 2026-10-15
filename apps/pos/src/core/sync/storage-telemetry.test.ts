import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  nodeStartupStorageFileSystem,
  nodeStorageFileSystem,
  type StartupStorageFileSystem,
  type StorageFileSystem,
  storageReadingNow,
  storageReadingReader,
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

function startupFileSystemWith(
  sizes: Record<string, number>,
  capacity: { availableBytes: number; totalBytes: number },
): StartupStorageFileSystem {
  return {
    sizeOf: (path) => sizes[path],
    capacityOf: () => capacity,
  };
}

describe("the register's storage telemetry", () => {
  it("reads the size of the database's write-ahead log and the free space of its folder's volume", async () => {
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
    expect(fileSystem.measured).toEqual(["/data"]);
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

describe("the register's storage reading", () => {
  it("adds the size of the database file to the log size and the free space", async () => {
    const fileSystem = fileSystemWith(
      { "/data/register.sqlite": 4_000_000, "/data/register.sqlite-wal": 8192 },
      { availableBytes: 25_000, totalBytes: 100_000 },
    );

    const reading = await storageReadingReader("/data/register.sqlite", fileSystem)();

    expect(reading).toEqual({
      database_size_bytes: 4_000_000,
      wal_size_bytes: 8192,
      disk_free_bytes: 25_000,
      disk_free_ratio: 0.25,
    });
  });

  it("counts a database file that doesn't exist as empty", async () => {
    const fileSystem = fileSystemWith({}, { availableBytes: 1, totalBytes: 2 });

    const reading = await storageReadingReader("/data/register.sqlite", fileSystem)();

    expect(reading.database_size_bytes).toBe(0);
  });
});

describe("the register's storage reading at startup", () => {
  it("adds the size of the database file to the log size and the free space", () => {
    const fileSystem = startupFileSystemWith(
      { "/data/register.sqlite": 4_000_000, "/data/register.sqlite-wal": 8192 },
      { availableBytes: 25_000, totalBytes: 100_000 },
    );

    expect(storageReadingNow("/data/register.sqlite", fileSystem)).toEqual({
      database_size_bytes: 4_000_000,
      wal_size_bytes: 8192,
      disk_free_bytes: 25_000,
      disk_free_ratio: 0.25,
    });
  });

  it("counts a database file that doesn't exist as empty", () => {
    const fileSystem = startupFileSystemWith({}, { availableBytes: 1, totalBytes: 2 });

    expect(storageReadingNow("/data/register.sqlite", fileSystem).database_size_bytes).toBe(0);
  });

  it("reads no free space ratio from a volume that reports no size", () => {
    const fileSystem = startupFileSystemWith({}, { availableBytes: 0, totalBytes: 0 });

    expect(storageReadingNow("/data/register.sqlite", fileSystem).disk_free_ratio).toBe(0);
  });

  it("never reports more free space than the volume holds", () => {
    const fileSystem = startupFileSystemWith({}, { availableBytes: 3, totalBytes: 2 });

    expect(storageReadingNow("/data/register.sqlite", fileSystem).disk_free_ratio).toBe(1);
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

  it("reads the storage of a database whose file is missing from its folder", async () => {
    const telemetry = await storageTelemetryReader(
      join(folder, "register.sqlite"),
      nodeStorageFileSystem,
    )();

    expect(telemetry.wal_size_bytes).toBe(0);
    expect(telemetry.disk_free_bytes).toBeGreaterThanOrEqual(0);
  });

  it("measures the space available to the user on the volume holding a path", async () => {
    const { availableBytes, totalBytes } = await nodeStorageFileSystem.capacityOf(folder);

    expect(Number.isInteger(availableBytes)).toBe(true);
    expect(availableBytes).toBeGreaterThanOrEqual(0);
    expect(totalBytes).toBeGreaterThan(0);
    expect(availableBytes).toBeLessThanOrEqual(totalBytes);
  });
});

describe("the computer's file system read without waiting", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "register-storage-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true });
  });

  it("measures the size of a file, and finds none for a file that doesn't exist", async () => {
    await writeFile(join(folder, "register.sqlite-wal"), "12345");

    expect(nodeStartupStorageFileSystem.sizeOf(join(folder, "register.sqlite-wal"))).toBe(5);
    expect(nodeStartupStorageFileSystem.sizeOf(join(folder, "missing"))).toBeUndefined();
  });

  it("reads the storage of a database whose file is missing from its folder", () => {
    const reading = storageReadingNow(
      join(folder, "register.sqlite"),
      nodeStartupStorageFileSystem,
    );

    expect(reading.database_size_bytes).toBe(0);
    expect(reading.wal_size_bytes).toBe(0);
    expect(reading.disk_free_bytes).toBeGreaterThanOrEqual(0);
  });

  it("measures the space available to the user on the volume holding a path", () => {
    const { availableBytes, totalBytes } = nodeStartupStorageFileSystem.capacityOf(folder);

    expect(Number.isInteger(availableBytes)).toBe(true);
    expect(availableBytes).toBeGreaterThanOrEqual(0);
    expect(totalBytes).toBeGreaterThan(0);
    expect(availableBytes).toBeLessThanOrEqual(totalBytes);
  });
});
