export type SnapshotRestoreFailureStage =
  | "download"
  | "hash_mismatch"
  | "missing_key_version"
  | "decryption"
  | "integrity_check"
  | "foreign_key_check";
