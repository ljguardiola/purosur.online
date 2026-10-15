import type { LocalSnapshotGeneration } from "./local-snapshot-generation.js";
import { diskStanding, RETAINED_SNAPSHOT_GENERATIONS } from "./storage.js";

export interface SnapshotDiskSpace {
  diskFreeBytes: number;
  diskFreeRatio: number;
}

export interface SnapshotDiskPruningPlan {
  remove: LocalSnapshotGeneration[];
  removeIfVerified: LocalSnapshotGeneration[];
}

function newestFirst(a: LocalSnapshotGeneration, b: LocalSnapshotGeneration): number {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() || b.generationId.localeCompare(a.generationId)
  );
}

function isUploaded(generation: LocalSnapshotGeneration): boolean {
  return generation.uploadedAt !== null;
}

export function snapshotDiskPruningPlan(
  generations: readonly LocalSnapshotGeneration[],
  space: SnapshotDiskSpace,
): SnapshotDiskPruningPlan {
  const byNewest = [...generations].sort(newestFirst);
  const oldest = byNewest.at(-1);
  const prunable = (generation: LocalSnapshotGeneration) =>
    isUploaded(generation) && generation !== oldest;

  if (
    diskStanding({ disk_free_bytes: space.diskFreeBytes, disk_free_ratio: space.diskFreeRatio }) ===
    "enough"
  ) {
    return {
      remove: [],
      removeIfVerified: byNewest.slice(RETAINED_SNAPSHOT_GENERATIONS).filter(prunable),
    };
  }
  const newestUploaded = byNewest.find(isUploaded);
  return {
    remove: byNewest.filter(
      (generation) => prunable(generation) && generation !== newestUploaded,
    ),
    removeIfVerified: [],
  };
}
