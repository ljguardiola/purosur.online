import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { SnapshotJobResult } from "./run-snapshot-job";

export function snapshotWorkerMessageOf(
  result: SnapshotJobResult,
): SnapshotWorkerMessage | undefined {
  return result.kind === "aborted"
    ? { type: "snapshot-copy-failed", stage: result.stage }
    : undefined;
}
