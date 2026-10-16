import type { SnapshotDiskStore } from "./snapshot-on-disk-ports.js";

export interface RecordSnapshotGenerationsOnDiskPorts {
  store: SnapshotDiskStore;
}

export interface RecordSnapshotGenerationsOnDiskInput {
  registerId: string;
  generationIds: readonly string[];
}

export type RecordSnapshotGenerationsOnDiskOutcome = { kind: "recorded" };

export async function recordSnapshotGenerationsOnDisk(
  { store }: RecordSnapshotGenerationsOnDiskPorts,
  { registerId, generationIds }: RecordSnapshotGenerationsOnDiskInput,
): Promise<RecordSnapshotGenerationsOnDiskOutcome> {
  await store.transaction(async (tx) => {
    await tx.lockRegisterSnapshots(registerId);
    await tx.recordGenerationsOnRegisterDisk(registerId, generationIds);
  });
  return { kind: "recorded" };
}
