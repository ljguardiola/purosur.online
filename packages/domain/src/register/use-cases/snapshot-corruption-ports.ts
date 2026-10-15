import type { SnapshotCorruptionStage } from "../model/snapshot-generation.js";
import type { SnapshotCloudStep } from "./snapshot-upload-ports.js";

export interface SnapshotCorruptionReports {
  pending(): Promise<SnapshotCorruptionStage | undefined>;
  record(stage: SnapshotCorruptionStage): Promise<void>;
  settle(): Promise<void>;
}

export interface SnapshotCorruptionCloud {
  report(stage: SnapshotCorruptionStage): Promise<SnapshotCloudStep>;
}
