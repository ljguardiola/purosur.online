import type { BatteryReading } from "../model/battery.js";
import type { SnapshotCycleFacts, SnapshotSequences } from "../model/snapshot-cycle.js";

export interface SnapshotCycleState {
  lastGeneration(): Promise<SnapshotSequences | undefined>;
  hasPendingUploads(): Promise<boolean>;
  battery(): Promise<BatteryReading>;
  storage(): Promise<SnapshotCycleFacts["storage"]>;
  cloudReachable(): Promise<boolean>;
  localDatabaseDamaged(): Promise<boolean>;
}

export type SnapshotWorkerJob =
  | { kind: "take"; generationId: string; sequences: SnapshotSequences }
  | { kind: "upload_pending" };

export interface SnapshotWorkerLauncher {
  launch(job: SnapshotWorkerJob): Promise<boolean>;
}

export interface SnapshotLog {
  checkpoint(): Promise<void>;
}
