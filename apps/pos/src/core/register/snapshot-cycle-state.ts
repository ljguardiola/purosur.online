import {
  type BatteryReading,
  type BatteryReport,
  isPendingSnapshotGeneration,
  lastSnapshotGenerationSequences,
} from "@purosur/domain";
import type { SnapshotCycleState } from "@purosur/domain/register/use-cases";
import type { CloudReachability } from "../sync/cloud-reachability";
import type { StorageReading } from "../sync/storage-telemetry";
import { readGenerations } from "./snapshot-generations-folder";

export interface SnapshotCycleStateDeps {
  snapshotsFolder: string;
  batteryReport: () => BatteryReport | undefined;
  readStorage: () => Promise<StorageReading>;
  cloudReachability: () => CloudReachability;
  localDatabaseDamaged: () => boolean;
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
    lastGeneration: async () =>
      lastSnapshotGenerationSequences(await readGenerations(deps.snapshotsFolder)),
    hasPendingUploads: async () =>
      (await readGenerations(deps.snapshotsFolder)).some(isPendingSnapshotGeneration),
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
    localDatabaseDamaged: async () => deps.localDatabaseDamaged(),
  };
}
