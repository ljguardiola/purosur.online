import type { ReplenishAttempt } from "./replenish-restored-register-step";
import type { SyncResult } from "./sync-schedule";

export interface ReplenishBeforeSyncDeps {
  holdsRegisterIdentity: () => boolean;
  replenish: () => Promise<ReplenishAttempt>;
  report: (attempt: ReplenishAttempt) => void;
  onFailure: (error: unknown) => void;
  syncOnce: () => Promise<SyncResult>;
}

export function replenishBeforeSync({
  holdsRegisterIdentity,
  replenish,
  report,
  onFailure,
  syncOnce,
}: ReplenishBeforeSyncDeps): () => Promise<SyncResult> {
  const attemptReplenishment = async () => {
    try {
      report(await replenish());
    } catch (error) {
      onFailure(error);
    }
  };
  return async () => {
    if (holdsRegisterIdentity()) {
      await attemptReplenishment();
      return syncOnce();
    }
    const result = await syncOnce();
    if (holdsRegisterIdentity()) {
      await attemptReplenishment();
    }
    return result;
  };
}
