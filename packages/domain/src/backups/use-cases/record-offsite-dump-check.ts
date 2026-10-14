import {
  classifyOffsiteDumpCheck,
  type OffsiteDumpFailureReason,
  type ReportedOffsiteDumpCheck,
} from "../model/offsite-dump-check.js";
import type { OffsiteDumpCheckPorts } from "./offsite-dump-check-store.js";

export interface RecordOffsiteDumpCheckInput {
  night: string;
  check: ReportedOffsiteDumpCheck;
}

export type RecordOffsiteDumpCheckOutcome =
  | { kind: "verified"; night: string; sizeBytes: number }
  | { kind: "failed"; night: string; reason: OffsiteDumpFailureReason };

export async function recordOffsiteDumpCheck(
  { store }: OffsiteDumpCheckPorts,
  { night, check }: RecordOffsiteDumpCheckInput,
): Promise<RecordOffsiteDumpCheckOutcome> {
  return store.transaction<RecordOffsiteDumpCheckOutcome>(async (tx) => {
    const result = classifyOffsiteDumpCheck(check, await tx.latestVerifiedSizeBefore(night));
    await tx.recordResult(night, result);
    return result.status === "verified"
      ? { kind: "verified", night, sizeBytes: result.sizeBytes }
      : { kind: "failed", night, reason: result.reason };
  });
}
