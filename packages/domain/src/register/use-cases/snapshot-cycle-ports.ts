import type { BatteryReading } from "../model/battery.js";
import type { SnapshotCycleFacts, SnapshotSequences } from "../model/snapshot-cycle.js";

export interface SnapshotCycleState {
  lastGeneration(): Promise<SnapshotSequences | undefined>;
  currentSequences(): Promise<SnapshotSequences>;
  hasPendingUploads(): Promise<boolean>;
  battery(): Promise<BatteryReading>;
  storage(): Promise<SnapshotCycleFacts["storage"]>;
  cloudReachable(): Promise<boolean>;
}

export type SnapshotWorkerJob =
  | { kind: "take"; generationId: string; sequences: SnapshotSequences }
  | { kind: "upload_pending" };

export interface SnapshotWorkerLauncher {
  launch(job: SnapshotWorkerJob): Promise<boolean>;
}
