import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { SnapshotJobResult } from "./run-snapshot-job";

// A utility process can lose a message it posts right before it exits, so a worker that reports a
// failed copy or an announced key version stays alive until main, having read the report, ends it.
export function endSnapshotWorker(
  result: SnapshotJobResult,
  deps: { post: (message: SnapshotWorkerMessage) => void; exit: (code: number) => void },
): void {
  if (result.kind === "aborted") {
    deps.post({ type: "snapshot-copy-failed", stage: result.stage });
    return;
  }
  const version = result.uploads.latestAnnouncedKeyVersion;
  if (version !== undefined) {
    deps.post({ type: "snapshot-key-version-announced", version });
    return;
  }
  deps.exit(0);
}
