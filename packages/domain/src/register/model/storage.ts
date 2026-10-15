import type { StorageSalesDeniedReason } from "../../shared/index.js";

export const STORAGE_READ_INTERVAL_MS = 60_000;

export const RETAINED_SNAPSHOT_GENERATIONS = 6;

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
const SNAPSHOT_WORKING_COPIES = 2;
const STARTUP_HEADROOM_BYTES = 2 * GIGABYTE;

export const WAL_SIZE_LIMIT_BYTES = 256 * MEGABYTE;

export type DiskStanding = "enough" | "low" | "full";

export function requiredFreeBytes(databaseSizeBytes: number): number {
  return (
    (RETAINED_SNAPSHOT_GENERATIONS + SNAPSHOT_WORKING_COPIES) * databaseSizeBytes +
    STARTUP_HEADROOM_BYTES
  );
}

export function diskStanding({
  disk_free_bytes,
  disk_free_ratio,
}: {
  disk_free_bytes: number;
  disk_free_ratio: number;
}): DiskStanding {
  if (disk_free_ratio < 0.05 || disk_free_bytes < GIGABYTE) {
    return "full";
  }
  if (disk_free_ratio < 0.1 || disk_free_bytes < 2 * GIGABYTE) {
    return "low";
  }
  return "enough";
}

export function walOversized(walSizeBytes: number): boolean {
  return walSizeBytes > WAL_SIZE_LIMIT_BYTES;
}

type StartupDiskVerdict = { kind: "fine" } | { kind: "short"; required_free_bytes: number };

export function startupDiskVerdict({
  freeBytes,
  databaseSizeBytes,
}: {
  freeBytes: number;
  databaseSizeBytes: number;
}): StartupDiskVerdict {
  const required = requiredFreeBytes(databaseSizeBytes);
  return freeBytes < required ? { kind: "short", required_free_bytes: required } : { kind: "fine" };
}

export interface StorageStanding {
  startupShortOf: { requiredFreeBytes: number } | null;
  diskStanding: DiskStanding;
  diskFreeRatio: number | undefined;
  walOversized: boolean;
}

export type StorageSalesStop =
  | {
      reason: Extract<StorageSalesDeniedReason, "disk_space_short_at_startup">;
      required_free_bytes: number;
    }
  | { reason: Extract<StorageSalesDeniedReason, "disk_full">; disk_free_ratio?: number };

export function storageSalesStopOf({
  startupShortOf,
  diskStanding,
  diskFreeRatio,
}: StorageStanding): StorageSalesStop | undefined {
  if (startupShortOf !== null) {
    return {
      reason: "disk_space_short_at_startup",
      required_free_bytes: startupShortOf.requiredFreeBytes,
    };
  }
  if (diskStanding !== "full") {
    return undefined;
  }
  return diskFreeRatio === undefined
    ? { reason: "disk_full" }
    : { reason: "disk_full", disk_free_ratio: diskFreeRatio };
}
