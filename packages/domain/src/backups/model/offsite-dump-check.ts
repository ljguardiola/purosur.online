export const OFFSITE_DUMP_REPORTED_FAILURE_REASONS = [
  "object_missing",
  "manifest_missing",
  "size_mismatch",
  "hash_mismatch",
  "decryption_failed",
  "archive_unreadable",
] as const;

export type OffsiteDumpReportedFailureReason =
  (typeof OFFSITE_DUMP_REPORTED_FAILURE_REASONS)[number];

export const OFFSITE_DUMP_FAILURE_REASONS = [
  ...OFFSITE_DUMP_REPORTED_FAILURE_REASONS,
  "shrank",
] as const;

export type OffsiteDumpFailureReason = (typeof OFFSITE_DUMP_FAILURE_REASONS)[number];

export const OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT = 50;

export type ReportedOffsiteDumpCheck =
  | { outcome: "passed"; sizeBytes: number }
  | { outcome: "failed"; reason: OffsiteDumpReportedFailureReason };

export type OffsiteDumpCheckResult =
  | { status: "verified"; sizeBytes: number }
  | { status: "failed"; reason: OffsiteDumpFailureReason };

export function classifyOffsiteDumpCheck(
  check: ReportedOffsiteDumpCheck,
  latestEarlierVerifiedSizeBytes: number | undefined,
): OffsiteDumpCheckResult {
  if (check.outcome === "failed") {
    return { status: "failed", reason: check.reason };
  }
  if (
    latestEarlierVerifiedSizeBytes !== undefined &&
    check.sizeBytes * 100 < latestEarlierVerifiedSizeBytes * OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT
  ) {
    return { status: "failed", reason: "shrank" };
  }
  return { status: "verified", sizeBytes: check.sizeBytes };
}
