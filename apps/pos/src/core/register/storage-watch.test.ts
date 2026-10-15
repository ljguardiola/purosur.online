import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import type { StorageReading } from "../sync/storage-telemetry";
import { createStorageWatch, type StorageWatch } from "./storage-watch";

const INTERVAL_MS = 60_000;
const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

const PLENTY: StorageReading = {
  database_size_bytes: 100 * MEGABYTE,
  wal_size_bytes: 4 * MEGABYTE,
  disk_free_bytes: 100 * GIGABYTE,
  disk_free_ratio: 0.5,
};
const LOW: StorageReading = { ...PLENTY, disk_free_bytes: GIGABYTE * 1.5, disk_free_ratio: 0.08 };
const FULL: StorageReading = { ...PLENTY, disk_free_bytes: GIGABYTE * 0.5, disk_free_ratio: 0.03 };
const OVERSIZED_WAL: StorageReading = { ...PLENTY, wal_size_bytes: 300 * MEGABYTE };
const SHORT_FOR_STARTUP: StorageReading = { ...PLENTY, disk_free_bytes: 2 * GIGABYTE };
const DISK_FULL_ERROR = new Database.SqliteError("database or disk is full", "SQLITE_FULL");

function setup(options: { first?: StorageReading | Error } = {}) {
  const world = { reading: options.first ?? PLENTY };
  const pending: { run: () => Promise<void>; delayMs: number; cancelled: boolean }[] = [];
  const onChange = vi.fn();
  const onFailure = vi.fn();
  const onStartupFailure = vi.fn();
  const watch = createStorageWatch({
    read: async () => {
      if (world.reading instanceof Error) {
        throw world.reading;
      }
      return world.reading;
    },
    intervalMs: INTERVAL_MS,
    scheduleNext: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    onChange,
    onFailure,
    onStartupFailure,
  });
  const nextRead = () => pending.filter((entry) => !entry.cancelled).at(-1);
  async function advance(reading?: StorageReading | Error): Promise<void> {
    if (reading !== undefined) {
      world.reading = reading;
    }
    const entry = nextRead();
    if (entry === undefined) {
      throw new Error("no read is scheduled");
    }
    entry.cancelled = true;
    await entry.run();
  }
  return { watch, onChange, onFailure, onStartupFailure, nextRead, advance };
}

describe("watching the register's storage", () => {
  it("holds a roomy disk and a small log before the first read has finished", () => {
    const { watch } = setup();

    expect(watch.standing()).toEqual({
      startupShortOf: null,
      diskStanding: "enough",
      diskFreeRatio: undefined,
      walOversized: false,
    });
    expect(watch.stop()).toBeUndefined();
  });

  it("reads right away and schedules the next read after the interval", async () => {
    const { watch, nextRead } = setup({ first: LOW });

    await watch.start();

    expect(watch.standing().diskStanding).toBe("low");
    expect(nextRead()?.delayMs).toBe(INTERVAL_MS);
  });

  it("keeps the figure of the disk's free space as a ratio", async () => {
    const { watch } = setup({ first: FULL });

    await watch.start();

    expect(watch.standing().diskFreeRatio).toBe(0.03);
  });

  it("flags a log that grew past the limit", async () => {
    const { watch } = setup({ first: OVERSIZED_WAL });

    await watch.start();

    expect(watch.standing().walOversized).toBe(true);
  });

  it("stops new sales while the disk is full", async () => {
    const { watch } = setup({ first: FULL });

    await watch.start();

    expect(watch.stop()).toEqual({ reason: "disk_full", disk_free_ratio: 0.03 });
  });

  it("does not stop new sales while the disk is only low", async () => {
    const { watch } = setup({ first: LOW });

    await watch.start();

    expect(watch.stop()).toBeUndefined();
  });

  it("stops new sales for the whole session when the check at startup finds the disk short of space", async () => {
    const { watch, advance } = setup({ first: SHORT_FOR_STARTUP });
    const required = 8 * PLENTY.database_size_bytes + 2 * GIGABYTE;

    await watch.checkAtStartup();
    await watch.start();
    await advance(PLENTY);

    expect(watch.stop()).toEqual({
      reason: "disk_space_short_at_startup",
      required_free_bytes: required,
    });
    expect(watch.standing().startupShortOf).toEqual({ requiredFreeBytes: required });
  });

  it("reports a failed check at startup through its own reporter and holds no shortage", async () => {
    const failure = new Error("the volume is gone");
    const { watch, onStartupFailure, onFailure } = setup({ first: failure });

    await watch.checkAtStartup();

    expect(onStartupFailure).toHaveBeenCalledWith(failure);
    expect(onFailure).not.toHaveBeenCalled();
    expect(watch.standing().startupShortOf).toBeNull();
  });

  it("takes a full disk its own check at startup reports back to it", async () => {
    const watch: StorageWatch = createStorageWatch({
      read: async () => {
        throw DISK_FULL_ERROR;
      },
      intervalMs: INTERVAL_MS,
      scheduleNext: () => () => {},
      onChange: vi.fn(),
      onStartupFailure: (error) => watch.noteFailure(error),
    });

    await watch.checkAtStartup();

    expect(watch.standing().diskStanding).toBe("full");
  });

  it("tells nobody about the first read when nothing is wrong", async () => {
    const { watch, onChange } = setup();

    await watch.start();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("tells when the disk standing changes and not when a read finds the same one", async () => {
    const { watch, onChange, advance } = setup();
    await watch.start();

    await advance(LOW);
    await advance({ ...LOW, disk_free_ratio: 0.07 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tells when the log grows past the limit and when it shrinks back", async () => {
    const { watch, onChange, advance } = setup();
    await watch.start();

    await advance(OVERSIZED_WAL);
    await advance(PLENTY);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("tells when the first read already finds a condition", async () => {
    const { watch, onChange } = setup({ first: FULL });

    await watch.start();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  describe("when a write fails because the disk is full", () => {
    it("stops new sales and tells right away, before any read finds the disk full", async () => {
      const { watch, onChange } = setup();
      await watch.start();

      watch.noteFailure(DISK_FULL_ERROR);

      expect(watch.stop()?.reason).toBe("disk_full");
      expect(watch.standing().diskStanding).toBe("full");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("tells once for a failure that repeats", async () => {
      const { watch, onChange } = setup();
      await watch.start();

      watch.noteFailure(DISK_FULL_ERROR);
      watch.noteFailure(DISK_FULL_ERROR);

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("keeps new sales stopped while a read still finds the disk full", async () => {
      const { watch, advance } = setup();
      await watch.start();
      watch.noteFailure(DISK_FULL_ERROR);

      await advance(FULL);

      expect(watch.stop()?.reason).toBe("disk_full");
    });

    it("carries no figure of the free space until a read made after the failure gives one", async () => {
      const { watch, advance } = setup({ first: FULL });
      await watch.start();
      watch.noteFailure(DISK_FULL_ERROR);
      const before = watch.standing().diskFreeRatio;

      await advance({ ...FULL, disk_free_ratio: 0.02 });

      expect(before).toBeUndefined();
      expect(watch.standing().diskFreeRatio).toBe(0.02);
    });

    it("tells nothing before it starts, and tells once its first read still finds the disk full", async () => {
      const { watch, onChange } = setup({ first: FULL });

      watch.noteFailure(DISK_FULL_ERROR);
      const toldBeforeStart = onChange.mock.calls.length;
      await watch.start();

      expect(toldBeforeStart).toBe(0);
      expect(watch.standing().diskFreeRatio).toBe(0.03);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("lets new sales open again once a read finds the disk above the stop thresholds", async () => {
      const { watch, onChange, advance } = setup();
      await watch.start();
      watch.noteFailure(DISK_FULL_ERROR);

      await advance(LOW);

      expect(watch.stop()).toBeUndefined();
      expect(watch.standing().diskStanding).toBe("low");
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("ignores a failure that is not a full disk", async () => {
      const { watch, onChange } = setup();
      await watch.start();

      watch.noteFailure(new Database.SqliteError("busy", "SQLITE_BUSY"));
      watch.noteFailure(new Error("SQLITE_FULL"));

      expect(watch.stop()).toBeUndefined();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("when a read fails", () => {
    it("reports the failure once, keeps the last standing and keeps reading", async () => {
      const { watch, onFailure, advance, nextRead } = setup({ first: LOW });
      await watch.start();
      const failure = new Error("the volume is gone");

      await advance(failure);
      await advance(failure);

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(failure);
      expect(watch.standing().diskStanding).toBe("low");
      expect(nextRead()?.delayMs).toBe(INTERVAL_MS);
    });

    it("reports a failure again after a read succeeded in between", async () => {
      const { watch, onFailure, advance } = setup();
      await watch.start();

      await advance(new Error("first"));
      await advance(PLENTY);
      await advance(new Error("second"));

      expect(onFailure).toHaveBeenCalledTimes(2);
    });
  });
});
