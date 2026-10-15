import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { SnapshotJobResult } from "./run-snapshot-job";

// A utility process can lose a message it posts right before it exits, so a worker that reports a
// failed copy stays alive until main, having read the report, ends it.
export function endSnapshotWorker(
  result: SnapshotJobResult,
  deps: { post: (message: SnapshotWorkerMessage) => void; exit: (code: number) => void },
): void {
  if (result.kind === "aborted") {
    deps.post({ type: "snapshot-copy-failed", stage: result.stage });
    return;
  }
  deps.exit(0);
}
