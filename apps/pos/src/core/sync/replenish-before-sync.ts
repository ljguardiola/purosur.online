import type { ReplenishAttempt } from "./replenish-restored-register-step";
import type { SyncResult } from "./sync-schedule";

export interface ReplenishBeforeSyncDeps {
  replenish: () => Promise<ReplenishAttempt>;
  report: (attempt: ReplenishAttempt) => void;
  onFailure: (error: unknown) => void;
  syncOnce: () => Promise<SyncResult>;
}

export function replenishBeforeSync({
  replenish,
  report,
  onFailure,
  syncOnce,
}: ReplenishBeforeSyncDeps): () => Promise<SyncResult> {
  return async () => {
    try {
      report(await replenish());
    } catch (error) {
      onFailure(error);
    }
    return syncOnce();
  };
}
