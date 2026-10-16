import type { SnapshotDiskStore, SnapshotDiskStoreTransaction } from "../snapshot-on-disk-ports.js";

export interface FakeDiskGeneration {
  id: string;
  registerId: string;
  onRegisterDisk: boolean;
}

export class FakeSnapshotDiskStore implements SnapshotDiskStore {
  readonly generations: FakeDiskGeneration[] = [];
  readonly operations: string[] = [];

  seedGeneration(generation: Partial<FakeDiskGeneration> & Pick<FakeDiskGeneration, "id">): void {
    this.generations.push({ registerId: "register-1", onRegisterDisk: false, ...generation });
  }

  onDiskIds(): string[] {
    return this.generations
      .filter((generation) => generation.onRegisterDisk)
      .map((generation) => generation.id);
  }

  async transaction<TOutcome>(
    work: (tx: SnapshotDiskStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return work({
      lockRegisterSnapshots: async (registerId) => {
        this.operations.push(`lockRegisterSnapshots:${registerId}`);
      },
      recordGenerationsOnRegisterDisk: async (registerId, generationIds) => {
        this.operations.push(`recordGenerationsOnRegisterDisk:${registerId}`);
        for (const generation of this.generations) {
          if (generation.registerId === registerId) {
            generation.onRegisterDisk = generationIds.includes(generation.id);
          }
        }
      },
    });
  }
}
