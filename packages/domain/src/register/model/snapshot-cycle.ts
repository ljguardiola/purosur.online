import type { BatteryReading } from "./battery.js";
import { diskStanding, walOversized } from "./storage.js";

export const SNAPSHOT_INTERVAL_ONLINE_MS = 5 * 60 * 1000;

export const SNAPSHOT_INTERVAL_OFFLINE_MS = 30 * 60 * 1000;

export const SNAPSHOT_BATTERY_FLOOR_PERCENT = 20;

export function snapshotIntervalMs(cloudReachable: boolean): number {
  return cloudReachable ? SNAPSHOT_INTERVAL_ONLINE_MS : SNAPSHOT_INTERVAL_OFFLINE_MS;
}

export interface SnapshotSequences {
  lastDeviceSeq: number;
  pullCursor: number;
}

export interface SnapshotCycleFacts {
  lastGeneration: SnapshotSequences | undefined;
  current: SnapshotSequences;
  battery: BatteryReading;
  storage: { diskFreeBytes: number; diskFreeRatio: number; walSizeBytes: number };
  pendingUploads: boolean;
  cloudReachable: boolean;
  localDatabaseDamaged: boolean;
}

export type SnapshotSkipReason =
  | "unchanged"
  | "battery_low"
  | "disk_low"
  | "wal_oversized"
  | "database_damaged";

export type SnapshotCycleDecision =
  | { kind: "take" }
  | { kind: "upload_pending" }
  | { kind: "skip"; reason: SnapshotSkipReason };

function moved(last: SnapshotSequences | undefined, current: SnapshotSequences): boolean {
  return (
    last === undefined ||
    last.lastDeviceSeq !== current.lastDeviceSeq ||
    last.pullCursor !== current.pullCursor
  );
}

function blockingReason({
  battery,
  storage,
}: SnapshotCycleFacts): Exclude<SnapshotSkipReason, "unchanged" | "database_damaged"> | undefined {
  if (battery.kind === "present" && battery.chargePercent < SNAPSHOT_BATTERY_FLOOR_PERCENT) {
    return "battery_low";
  }
  if (
    diskStanding({
      disk_free_bytes: storage.diskFreeBytes,
      disk_free_ratio: storage.diskFreeRatio,
    }) !== "enough"
  ) {
    return "disk_low";
  }
  return walOversized(storage.walSizeBytes) ? "wal_oversized" : undefined;
}

function reasonNotToTake(facts: SnapshotCycleFacts): SnapshotSkipReason | undefined {
  if (facts.localDatabaseDamaged) {
    return "database_damaged";
  }
  return moved(facts.lastGeneration, facts.current) ? blockingReason(facts) : "unchanged";
}

export function snapshotCycleDecision(facts: SnapshotCycleFacts): SnapshotCycleDecision {
  const reason = reasonNotToTake(facts);
  if (reason === undefined) {
    return { kind: "take" };
  }
  return facts.pendingUploads && facts.cloudReachable
    ? { kind: "upload_pending" }
    : { kind: "skip", reason };
}
