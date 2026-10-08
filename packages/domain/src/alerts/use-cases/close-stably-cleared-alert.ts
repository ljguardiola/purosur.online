import type { AlertStoreTransaction, LockedAlert } from "./alert-store.js";
import { keptAfterClosure } from "./kept-after-closure.js";

export function closeStablyClearedAlert(
  tx: AlertStoreTransaction,
  alert: Pick<LockedAlert, "kind" | "scope" | "detail"> & { alertId: string },
  closedAt: Date,
  hash: (address: string) => string,
): Promise<void> {
  return tx.recordClosure(alert.alertId, {
    closedAt,
    closedBy: null,
    ...keptAfterClosure(alert, hash),
  });
}
