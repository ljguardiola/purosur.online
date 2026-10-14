import type { Clock } from "../../shared/index.js";
import type { SnapshotCorruptionStage } from "../model/snapshot-generation.js";
import type { SnapshotStore } from "./snapshot-generations.js";

export interface ReportSnapshotCorruptionPorts {
  store: SnapshotStore;
  clock: Clock;
}

export interface ReportSnapshotCorruptionInput {
  registerId: string;
  stage: SnapshotCorruptionStage;
}

export async function reportSnapshotCorruption(
  { store, clock }: ReportSnapshotCorruptionPorts,
  { registerId, stage }: ReportSnapshotCorruptionInput,
): Promise<{ kind: "frozen" }> {
  await store.transaction(async (tx) => {
    await tx.lockRegisterSnapshots(registerId);
    await tx.freezeRetention(registerId, stage, clock.now());
  });
  return { kind: "frozen" };
}
