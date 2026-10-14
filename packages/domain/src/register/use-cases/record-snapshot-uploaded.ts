import type { Clock } from "../../shared/index.js";
import type { SnapshotStore } from "./snapshot-generations.js";

export interface RecordSnapshotUploadedPorts {
  store: SnapshotStore;
  clock: Clock;
}

export interface RecordSnapshotUploadedInput {
  registerId: string;
  generationId: string;
}

export type RecordSnapshotUploadedOutcome = { kind: "recorded" } | { kind: "generation_unknown" };

export async function recordSnapshotUploaded(
  { store, clock }: RecordSnapshotUploadedPorts,
  { registerId, generationId }: RecordSnapshotUploadedInput,
): Promise<RecordSnapshotUploadedOutcome> {
  return store.transaction<RecordSnapshotUploadedOutcome>(async (tx) => {
    await tx.lockRegisterSnapshots(registerId);
    const generation = await tx.findGeneration(registerId, generationId);
    if (!generation) {
      return { kind: "generation_unknown" };
    }
    if (generation.status === "declared") {
      await tx.recordUploadReported(generationId, clock.now());
    }
    return { kind: "recorded" };
  });
}
