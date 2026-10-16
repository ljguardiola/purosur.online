export interface SnapshotDiskStoreTransaction {
  lockRegisterSnapshots(registerId: string): Promise<void>;
  recordGenerationsOnRegisterDisk(
    registerId: string,
    generationIds: readonly string[],
  ): Promise<void>;
}

export interface SnapshotDiskStore {
  transaction<TOutcome>(
    work: (tx: SnapshotDiskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
