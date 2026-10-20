import type { SyncResult } from "../sync/sync-schedule";

export function syncUnlessRestorePending(
  restorePending: () => boolean,
  attemptRestore: () => void,
  syncOnce: () => Promise<SyncResult>,
): () => Promise<SyncResult> {
  return async () => {
    if (!restorePending()) {
      return syncOnce();
    }
    attemptRestore();
    return { kind: "succeeded" };
  };
}
