export const SNAPSHOT_RESTORE_FAILURE_STAGES = [
  "download",
  "hash_mismatch",
  "missing_key_version",
  "decryption",
  "integrity_check",
  "foreign_key_check",
] as const;

export type SnapshotRestoreFailureStage = (typeof SNAPSHOT_RESTORE_FAILURE_STAGES)[number];
