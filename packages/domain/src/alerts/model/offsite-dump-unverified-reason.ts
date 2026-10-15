import { OFFSITE_DUMP_FAILURE_REASONS } from "../../backups/index.js";

export const OFFSITE_DUMP_UNVERIFIED_REASONS = [
  "not_reported",
  ...OFFSITE_DUMP_FAILURE_REASONS,
] as const;

export type OffsiteDumpUnverifiedReason = (typeof OFFSITE_DUMP_UNVERIFIED_REASONS)[number];
