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

export const SNAPSHOT_WORKER_TIME_LIMIT_MS = 60 * 1000;

const SNAPSHOT_UPLOAD_URL_LIFETIME_MS = 15 * 60 * 1000;

export const SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS = 15 * 60 * 1000;

export function snapshotUploadUrlExpiry(declaredAt: Date, now: Date): Date | undefined {
  const expiry = Math.min(
    now.getTime() + SNAPSHOT_UPLOAD_URL_LIFETIME_MS,
    declaredAt.getTime() + SNAPSHOT_UPLOAD_DEADLINE_MS - SNAPSHOT_WORKER_TIME_LIMIT_MS,
  );
  return expiry > now.getTime() ? new Date(expiry) : undefined;
}

export const SNAPSHOT_STATUSES_AWAITING_VERIFICATION = [
  "declared",
  "uploaded",
] as const satisfies readonly SnapshotGenerationStatus[];

export function isAwaitingSnapshotVerification(status: SnapshotGenerationStatus): boolean {
  return (SNAPSHOT_STATUSES_AWAITING_VERIFICATION as readonly SnapshotGenerationStatus[]).includes(
    status,
  );
}

export const SNAPSHOT_STATUSES_RETAINED = [
  "declared",
  "uploaded",
  "verified",
] as const satisfies readonly SnapshotGenerationStatus[];

export function isRetainedSnapshotGeneration(generation: {
  status: SnapshotGenerationStatus;
  pruned: boolean;
}): boolean {
  return (
    !generation.pruned &&
    (SNAPSHOT_STATUSES_RETAINED as readonly SnapshotGenerationStatus[]).includes(generation.status)
  );
}
