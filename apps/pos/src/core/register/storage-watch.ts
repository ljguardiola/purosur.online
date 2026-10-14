import {
  type DiskStanding,
  diskStanding,
  type StorageSalesStop,
  type StorageStanding,
  storageSalesStopOf,
  walOversized,
} from "@purosur/domain";
import { isDiskFull } from "../platform/disk-full";
import type { StorageReading } from "../sync/storage-telemetry";
import { startupStorageShortOf } from "./storage-startup-check";

export interface StorageWatchDeps {
  read: () => Promise<StorageReading>;
  intervalMs: number;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  onChange: () => void;
  onFailure?: (error: unknown) => void;
  onStartupFailure: (error: unknown) => void;
}

export interface StorageWatch {
  checkAtStartup(): Promise<void>;
  start(): Promise<void>;
  standing(): StorageStanding;
  stop(): StorageSalesStop | undefined;
  noteFailure(error: unknown): void;
}

export function createStorageWatch(deps: StorageWatchDeps): StorageWatch {
  let startupShortOf: { requiredFreeBytes: number } | null = null;
  let latest: StorageReading | undefined;
  let diskFullByWrite = false;
  let readSinceDiskFullByWrite = true;
  let failing = false;
  let started = false;
  let announced = "enough|false";

  function currentDiskStanding(): DiskStanding {
    if (diskFullByWrite) {
      return "full";
    }
    return latest === undefined ? "enough" : diskStanding(latest);
  }

  function standing(): StorageStanding {
    return {
      startupShortOf,
      diskStanding: currentDiskStanding(),
      diskFreeRatio: readSinceDiskFullByWrite ? latest?.disk_free_ratio : undefined,
      walOversized: latest !== undefined && walOversized(latest.wal_size_bytes),
    };
  }

  function announceChange(): void {
    if (!started) {
      return;
    }
    const current = standing();
    const key = `${current.diskStanding}|${current.walOversized}`;
    if (key !== announced) {
      announced = key;
      deps.onChange();
    }
  }

  async function readOnce(): Promise<void> {
    try {
      const reading = await deps.read();
      failing = false;
      latest = reading;
      readSinceDiskFullByWrite = true;
      if (diskStanding(reading) !== "full") {
        diskFullByWrite = false;
      }
      announceChange();
    } catch (error) {
      if (!failing) {
        failing = true;
        deps.onFailure?.(error);
      }
    }
  }

  async function read(): Promise<void> {
    await readOnce();
    deps.scheduleNext(read, deps.intervalMs);
  }

  return {
    checkAtStartup: async () => {
      startupShortOf = await startupStorageShortOf({
        read: deps.read,
        onFailure: deps.onStartupFailure,
      });
    },
    start: () => {
      started = true;
      return read();
    },
    standing,
    stop: () => storageSalesStopOf(standing()),
    noteFailure: (error) => {
      if (isDiskFull(error)) {
        diskFullByWrite = true;
        readSinceDiskFullByWrite = false;
        announceChange();
      }
    },
  };
}
