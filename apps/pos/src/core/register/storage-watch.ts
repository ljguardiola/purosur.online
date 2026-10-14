import {
  type DiskStanding,
  diskStanding,
  type StorageSalesStop,
  type StorageStanding,
  walOversized,
} from "@purosur/domain";
import { isDiskFull } from "../platform/disk-full";
import type { StorageReading } from "../sync/storage-telemetry";

export interface StorageWatchDeps {
  read: () => Promise<StorageReading>;
  intervalMs: number;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  startupShortOf: { requiredFreeBytes: number } | null;
  onChange: () => void;
  onFailure?: (error: unknown) => void;
}

export interface StorageWatch {
  start(): Promise<void>;
  standing(): StorageStanding;
  stop(): StorageSalesStop | undefined;
  noteFailure(error: unknown): void;
}

export function createStorageWatch(deps: StorageWatchDeps): StorageWatch {
  let latest: StorageReading | undefined;
  let diskFullByWrite = false;
  let failing = false;
  let announced = "enough|false";

  function currentDiskStanding(): DiskStanding {
    if (diskFullByWrite) {
      return "full";
    }
    return latest === undefined ? "enough" : diskStanding(latest);
  }

  function standing(): StorageStanding {
    return {
      startupShortOf: deps.startupShortOf,
      diskStanding: currentDiskStanding(),
      diskFreeRatio: latest?.disk_free_ratio ?? 1,
      walOversized: latest !== undefined && walOversized(latest.wal_size_bytes),
    };
  }

  function announceChange(): void {
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
    start: read,
    standing,
    stop: () => {
      if (deps.startupShortOf !== null) {
        return "short_at_startup";
      }
      return currentDiskStanding() === "full" ? "disk_full" : undefined;
    },
    noteFailure: (error) => {
      if (isDiskFull(error)) {
        diskFullByWrite = true;
        announceChange();
      }
    },
  };
}
