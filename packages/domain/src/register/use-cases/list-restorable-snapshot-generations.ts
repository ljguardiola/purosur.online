import type { SnapshotStore } from "./snapshot-generations.js";

export interface ListRestorableSnapshotGenerationsPorts {
  store: SnapshotStore;
}

export interface RestorableSnapshotGeneration {
  generationId: string;
  registerId: string;
  createdAt: Date;
  size: number;
  sha256: string;
  keyVersion: number;
}

export async function listRestorableSnapshotGenerations(
  { store }: ListRestorableSnapshotGenerationsPorts,
  { registerId }: { registerId: string },
): Promise<RestorableSnapshotGeneration[]> {
  const generations = await store.transaction((tx) => tx.generationsOf(registerId));
  return generations
    .filter((generation) => generation.status === "verified" && !generation.pruned)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((generation) => ({
      generationId: generation.id,
      registerId: generation.registerId,
      createdAt: generation.createdAt,
      size: generation.size,
      sha256: generation.sha256,
      keyVersion: generation.keyVersion,
    }));
}
