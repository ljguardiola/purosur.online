import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  diskStanding,
  RETAINED_SNAPSHOT_GENERATIONS,
  requiredFreeBytes,
  STORAGE_READ_INTERVAL_MS,
  type StorageStanding,
  startupDiskVerdict,
  storageSalesStopOf,
  WAL_SIZE_LIMIT_BYTES,
  walOversized,
} from "./storage.js";

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
const PLENTY = 100 * GIGABYTE;

describe("STORAGE_READ_INTERVAL_MS", () => {
  it("is one minute", () => {
    expect(STORAGE_READ_INTERVAL_MS).toBe(60_000);
  });
});

describe("RETAINED_SNAPSHOT_GENERATIONS", () => {
  it("is six", () => {
    expect(RETAINED_SNAPSHOT_GENERATIONS).toBe(6);
  });
});

describe("requiredFreeBytes", () => {
  it("is 2 GB for an empty database", () => {
    expect(requiredFreeBytes(0)).toBe(2 * GIGABYTE);
  });

  it("adds eight times the database size, the retained generations plus two, to 2 GB", () => {
    expect(requiredFreeBytes(500 * MEGABYTE)).toBe(8 * 500 * MEGABYTE + 2 * GIGABYTE);
  });

  it("grows by eight bytes for every byte of database", () => {
    fc.assert(
      fc.property(fc.nat(GIGABYTE), (size) => {
        expect(requiredFreeBytes(size + 1) - requiredFreeBytes(size)).toBe(8);
      }),
    );
  });
});

describe("diskStanding", () => {
  it("is enough with plenty of space free", () => {
    expect(diskStanding({ disk_free_bytes: PLENTY, disk_free_ratio: 0.5 })).toBe("enough");
  });

  it("is enough at exactly 10% and 2 GB free", () => {
    expect(diskStanding({ disk_free_bytes: 2 * GIGABYTE, disk_free_ratio: 0.1 })).toBe("enough");
  });

  it("is low just under 10% free", () => {
    expect(diskStanding({ disk_free_bytes: PLENTY, disk_free_ratio: 0.0999 })).toBe("low");
  });

  it("is low just under 2 GB free", () => {
    expect(diskStanding({ disk_free_bytes: 2 * GIGABYTE - 1, disk_free_ratio: 0.5 })).toBe("low");
  });

  it("is low at exactly 5% and 1 GB free", () => {
    expect(diskStanding({ disk_free_bytes: GIGABYTE, disk_free_ratio: 0.05 })).toBe("low");
  });

  it("is full just under 5% free", () => {
    expect(diskStanding({ disk_free_bytes: PLENTY, disk_free_ratio: 0.0499 })).toBe("full");
  });

  it("is full just under 1 GB free", () => {
    expect(diskStanding({ disk_free_bytes: GIGABYTE - 1, disk_free_ratio: 0.5 })).toBe("full");
  });

  it("is full with nothing free", () => {
    expect(diskStanding({ disk_free_bytes: 0, disk_free_ratio: 0 })).toBe("full");
  });
});

describe("walOversized", () => {
  it("limits the WAL to 256 MB", () => {
    expect(WAL_SIZE_LIMIT_BYTES).toBe(256 * MEGABYTE);
  });

  it("is false at exactly 256 MB", () => {
    expect(walOversized(256 * MEGABYTE)).toBe(false);
  });

  it("is true once it passes 256 MB", () => {
    expect(walOversized(256 * MEGABYTE + 1)).toBe(true);
  });

  it("is false for an empty WAL", () => {
    expect(walOversized(0)).toBe(false);
  });
});

describe("startupDiskVerdict", () => {
  const databaseSizeBytes = 500 * MEGABYTE;
  const required = requiredFreeBytes(databaseSizeBytes);

  it("is fine with exactly the required free space", () => {
    expect(startupDiskVerdict({ freeBytes: required, databaseSizeBytes })).toEqual({
      kind: "fine",
    });
  });

  it("is short, naming the required free space, one byte under it", () => {
    expect(startupDiskVerdict({ freeBytes: required - 1, databaseSizeBytes })).toEqual({
      kind: "short",
      required_free_bytes: required,
    });
  });

  it("is short for any free space under the requirement and fine for any at or over it", () => {
    fc.assert(
      fc.property(fc.nat(GIGABYTE), fc.nat(20 * GIGABYTE), (size, free) => {
        const verdict = startupDiskVerdict({ freeBytes: free, databaseSizeBytes: size });
        expect(verdict.kind).toBe(free < requiredFreeBytes(size) ? "short" : "fine");
      }),
    );
  });
});

describe("storageSalesStopOf", () => {
  const ROOMY: StorageStanding = {
    startupShortOf: null,
    diskStanding: "enough",
    diskFreeRatio: 0.4,
    walOversized: false,
  };

  it("stops nothing while the disk has room", () => {
    expect(storageSalesStopOf(ROOMY)).toBeUndefined();
  });

  it("stops nothing while the disk is only low", () => {
    expect(
      storageSalesStopOf({ ...ROOMY, diskStanding: "low", diskFreeRatio: 0.08 }),
    ).toBeUndefined();
  });

  it("stops sales for a full disk, with its free ratio", () => {
    expect(storageSalesStopOf({ ...ROOMY, diskStanding: "full", diskFreeRatio: 0.03 })).toEqual({
      reason: "disk_full",
      disk_free_ratio: 0.03,
    });
  });

  it("stops sales for a full disk with no free ratio when none was read since it filled", () => {
    expect(
      storageSalesStopOf({ ...ROOMY, diskStanding: "full", diskFreeRatio: undefined }),
    ).toStrictEqual({ reason: "disk_full" });
  });

  it("stops sales for a register short of space at startup, with the space it requires", () => {
    expect(
      storageSalesStopOf({ ...ROOMY, startupShortOf: { requiredFreeBytes: 5_000_000_000 } }),
    ).toEqual({ reason: "disk_space_short_at_startup", required_free_bytes: 5_000_000_000 });
  });

  it("names the startup shortage over a full disk", () => {
    expect(
      storageSalesStopOf({
        ...ROOMY,
        startupShortOf: { requiredFreeBytes: 5_000_000_000 },
        diskStanding: "full",
        diskFreeRatio: 0.03,
      }),
    ).toEqual({ reason: "disk_space_short_at_startup", required_free_bytes: 5_000_000_000 });
  });
});
