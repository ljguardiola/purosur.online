import {
  type LocalSnapshotGeneration,
  snapshotGenerationsNewestFirst,
} from "./local-snapshot-generation.js";
import { diskStanding, RETAINED_SNAPSHOT_GENERATIONS } from "./storage.js";

export interface SnapshotDiskSpace {
  diskFreeBytes: number;
  diskFreeRatio: number;
}

export interface SnapshotDiskPruningPlan {
  remove: LocalSnapshotGeneration[];
  removeIfVerified: LocalSnapshotGeneration[];
}

function isUploaded(generation: LocalSnapshotGeneration): boolean {
  return generation.uploadedAt !== null;
}

export function snapshotDiskPruningPlan(
  generations: readonly LocalSnapshotGeneration[],
  space: SnapshotDiskSpace,
): SnapshotDiskPruningPlan {
  const byNewest = snapshotGenerationsNewestFirst(generations);
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
