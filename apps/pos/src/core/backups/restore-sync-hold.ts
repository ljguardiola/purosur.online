import type { SyncResult } from "../sync/sync-schedule";

export function syncUnlessRestorePending(
  restorePending: () => boolean,
  syncOnce: () => Promise<SyncResult>,
): () => Promise<SyncResult> {
  return async () => (restorePending() ? { kind: "succeeded" } : syncOnce());
}
