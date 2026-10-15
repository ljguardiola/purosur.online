import type { BatteryReading, BatteryReport, SnapshotSequences } from "@purosur/domain";
import type { SnapshotCycleState } from "@purosur/domain/register/use-cases";
import type { CloudReachability } from "../sync/cloud-reachability";
import type { StorageReading } from "../sync/storage-telemetry";
import {
  lastGenerationSequences,
  pendingManifests,
  readManifests,
} from "./snapshot-generations-folder";

export interface SnapshotCycleStateDeps {
  snapshotsFolder: string;
  sequences: () => SnapshotSequences;
  batteryReport: () => BatteryReport | undefined;
  readStorage: () => Promise<StorageReading>;
  cloudReachability: () => CloudReachability;
}

function readingOf(report: BatteryReport | undefined): BatteryReading {
  if (report === undefined) {
    return { kind: "unreadable" };
  }
  return report.present
    ? { kind: "present", chargePercent: report.charge_percent, onBattery: report.on_battery }
    : { kind: "absent" };
}

export function createSnapshotCycleState(deps: SnapshotCycleStateDeps): SnapshotCycleState {
  return {
    lastGeneration: async () => lastGenerationSequences(await readManifests(deps.snapshotsFolder)),
    currentSequences: async () => deps.sequences(),
    hasPendingUploads: async () =>
      pendingManifests(await readManifests(deps.snapshotsFolder)).length > 0,
    battery: async () => readingOf(deps.batteryReport()),
    storage: async () => {
      const reading = await deps.readStorage();
      return {
        diskFreeBytes: reading.disk_free_bytes,
        diskFreeRatio: reading.disk_free_ratio,
        walSizeBytes: reading.wal_size_bytes,
      };
    },
    // A cloud not tried yet is taken as reachable: its first sync decides.
    cloudReachable: async () => deps.cloudReachability() !== "unreachable",
  };
}
