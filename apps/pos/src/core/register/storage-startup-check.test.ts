import { describe, expect, it, vi } from "vitest";
import type { StorageReading } from "../sync/storage-telemetry";
import { startupStorageShortOf } from "./storage-startup-check";

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

function reading(freeBytes: number, databaseSizeBytes: number): StorageReading {
  return {
    database_size_bytes: databaseSizeBytes,
    wal_size_bytes: 0,
    disk_free_bytes: freeBytes,
    disk_free_ratio: 0.5,
  };
}

describe("checking at startup that the disk has the space sales need", () => {
  it("finds the register short of the free space required for its database", async () => {
    const short = await startupStorageShortOf({
      read: async () => reading(5 * GIGABYTE, 500 * MEGABYTE),
      onFailure: vi.fn(),
    });

    expect(short).toEqual({ requiredFreeBytes: 8 * 500 * MEGABYTE + 2 * GIGABYTE });
  });

  it("finds nothing short when the disk has the free space required", async () => {
    const short = await startupStorageShortOf({
      read: async () => reading(50 * GIGABYTE, 500 * MEGABYTE),
      onFailure: vi.fn(),
    });

    expect(short).toBeNull();
  });

  it("finds nothing short, and reports the failure, when the disk cannot be read", async () => {
    const failure = new Error("the volume is gone");
    const onFailure = vi.fn();

    const short = await startupStorageShortOf({
      read: async () => {
        throw failure;
      },
      onFailure,
    });

    expect(short).toBeNull();
    expect(onFailure).toHaveBeenCalledWith(failure);
  });
});
