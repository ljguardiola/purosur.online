import type { SnapshotCorruptionStage } from "../model/snapshot-generation.js";
import type { LocalDatabaseHealthPorts } from "./local-database-health.js";
import type { SnapshotCorruptionReports } from "./snapshot-corruption-ports.js";

export interface RecordSnapshotCopyFailurePorts extends LocalDatabaseHealthPorts {
  reports: SnapshotCorruptionReports;
}

export interface RecordSnapshotCopyFailureInput {
  stage: SnapshotCorruptionStage;
}

export type RecordSnapshotCopyFailureOutcome = {
  kind: "recorded";
  stage: SnapshotCorruptionStage;
};

export async function recordSnapshotCopyFailure(
  { health, reports }: RecordSnapshotCopyFailurePorts,
  { stage }: RecordSnapshotCopyFailureInput,
): Promise<RecordSnapshotCopyFailureOutcome> {
  await reports.record(stage);
  await health.recordDamage();
  return { kind: "recorded", stage };
}
