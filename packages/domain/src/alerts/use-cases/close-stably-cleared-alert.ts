import type { AlertEmailRecorder } from "./alert-email-recorder.js";
import type { AlertStoreTransaction, LockedAlert } from "./alert-store.js";
import { keptAfterClosure } from "./kept-after-closure.js";

export async function closeStablyClearedAlert(
  tx: AlertStoreTransaction,
  recordEmails: AlertEmailRecorder,
  alert: Pick<LockedAlert, "kind" | "scope" | "locationId" | "detail" | "level"> & {
    alertId: string;
  },
  closedAt: Date,
  hash: (address: string) => string,
): Promise<void> {
  await tx.recordClosure(alert.alertId, {
    closedAt,
    closedBy: null,
    ...keptAfterClosure(alert, hash),
  });
  await recordEmails(alert, "resolved", alert.level, closedAt);
}
