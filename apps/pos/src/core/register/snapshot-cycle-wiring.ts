import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import type { BatteryReport } from "@purosur/domain";
import {
  type LocalDatabaseHealth,
  recordSnapshotCopyFailure,
  runSnapshotCycle,
  type SnapshotCorruptionReports,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { sqliteSyncSequences } from "../sync/sqlite-sync-sequences";
import type { StorageReading } from "../sync/storage-telemetry";
import { createSnapshotCycleSchedule, type SnapshotCycleSchedule } from "./snapshot-cycle-schedule";
import { createSnapshotCycleState } from "./snapshot-cycle-state";
import { createSnapshotWorkerLaunch } from "./snapshot-worker-launch";
import { readOwnRegisterId } from "./sqlite-snapshot-source";

export interface SnapshotCycleWiringDeps {
  database: LocalDatabase;
  databasePath: string;
  snapshotsFolder: string;
  cloudUrl: string | undefined;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  batteryReport: () => BatteryReport | undefined;
  cloudReachability: () => CloudReachability;
  readStorage: () => Promise<StorageReading>;
  newGenerationId: () => string;
  postToMain: (message: SnapshotWorkerLaunchRequest) => void;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => void;
  localDatabaseDamaged: () => boolean;
  health: LocalDatabaseHealth;
  reports: SnapshotCorruptionReports;
  onCopyFailureRecorded: () => void;
  onFailure: (error: unknown) => void;
}

export function startSnapshotCycle(deps: SnapshotCycleWiringDeps): SnapshotCycleSchedule {
  const state = createSnapshotCycleState({
    snapshotsFolder: deps.snapshotsFolder,
    batteryReport: deps.batteryReport,
    readStorage: deps.readStorage,
    cloudReachability: deps.cloudReachability,
    localDatabaseDamaged: deps.localDatabaseDamaged,
  });
  const launcher = createSnapshotWorkerLaunch({
    readCredentials: deps.readCredentials,
    readRegisterId: () => readOwnRegisterId(deps.database),
    cloudUrl: deps.cloudUrl,
    databasePath: deps.databasePath,
    snapshotsFolder: deps.snapshotsFolder,
    postToMain: deps.postToMain,
  });
  const syncSequences = sqliteSyncSequences(deps.database);
  const checkpoint = () => {
    deps.database.pragma("wal_checkpoint(TRUNCATE)");
  };
  const schedule = createSnapshotCycleSchedule({
    runCycle: async () =>
      runSnapshotCycle(
        {
          state,
          launcher,
          ids: { next: deps.newGenerationId },
          log: { checkpoint: async () => checkpoint() },
        },
        { current: await syncSequences.current() },
      ),
    cloudReachable: () => deps.cloudReachability() !== "unreachable",
    scheduleNext: deps.scheduleNext,
    checkpoint,
    recordCopyFailure: async (stage) => {
      await recordSnapshotCopyFailure({ health: deps.health, reports: deps.reports }, { stage });
      deps.onCopyFailureRecorded();
    },
    onFailure: deps.onFailure,
  });
  schedule.start();
  return schedule;
}
