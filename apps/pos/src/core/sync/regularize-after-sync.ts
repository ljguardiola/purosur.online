import type { OrphanSweepAttempt } from "../register/regularize-orphan-authorizations-step";
import type { SyncResult } from "./sync-schedule";

export interface RegularizeAfterSyncDeps {
  regularize: () => Promise<OrphanSweepAttempt>;
  report: (attempt: OrphanSweepAttempt) => void;
  onFailure: (error: unknown) => void;
  syncOnce: () => Promise<SyncResult>;
}

export function regularizeAfterSync({
  regularize,
  report,
  onFailure,
  syncOnce,
}: RegularizeAfterSyncDeps): () => Promise<SyncResult> {
  return async () => {
    const result = await syncOnce();
    try {
      report(await regularize());
    } catch (error) {
      onFailure(error);
    }
    return result;
  };
}
