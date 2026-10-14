export const SNAPSHOT_GENERATION_STATUSES = ["declared", "uploaded", "verified", "failed"] as const;

export type SnapshotGenerationStatus = (typeof SNAPSHOT_GENERATION_STATUSES)[number];

export const SNAPSHOT_FAILURE_REASONS = [
  "hash_mismatch",
  "size_mismatch",
  "never_uploaded",
] as const;

export type SnapshotFailureReason = (typeof SNAPSHOT_FAILURE_REASONS)[number];

export const SNAPSHOT_CORRUPTION_STAGES = ["copy", "integrity_check", "foreign_key_check"] as const;

export type SnapshotCorruptionStage = (typeof SNAPSHOT_CORRUPTION_STAGES)[number];

export const SNAPSHOT_VERIFICATION_INTERVAL_MS = 60 * 1000;

export const SNAPSHOT_RETENTION_INTERVAL_MS = 15 * 60 * 1000;

export const SNAPSHOT_UPLOAD_DEADLINE_MS = 60 * 60 * 1000;

export function isPastSnapshotUploadDeadline(declaredAt: Date, now: Date): boolean {
  return now.getTime() - declaredAt.getTime() > SNAPSHOT_UPLOAD_DEADLINE_MS;
}
