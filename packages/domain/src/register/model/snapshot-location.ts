import type { SnapshotFailureReason, SnapshotGenerationStatus } from "./snapshot-generation.js";

export const SNAPSHOT_LOCATIONS = ["disk_and_bucket", "bucket", "disk", "nowhere"] as const;

export type SnapshotLocation = (typeof SNAPSHOT_LOCATIONS)[number];

function isInBucket(generation: {
  status: SnapshotGenerationStatus;
  failureReason: SnapshotFailureReason | null;
}): boolean {
  if (generation.status === "failed") {
    return generation.failureReason !== "never_uploaded";
  }
  return generation.status !== "declared";
}

export function snapshotLocation(generation: {
  status: SnapshotGenerationStatus;
  failureReason: SnapshotFailureReason | null;
  onRegisterDisk: boolean;
}): SnapshotLocation {
  const inBucket = isInBucket(generation);
  if (inBucket) {
    return generation.onRegisterDisk ? "disk_and_bucket" : "bucket";
  }
  return generation.onRegisterDisk ? "disk" : "nowhere";
}
