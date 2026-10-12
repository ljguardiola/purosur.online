import { refundTaskAlertIsDue, refundTaskAlertLevel } from "../../alerts/index.js";
import type { Clock } from "../../shared/index.js";
import type { RefundTaskAlertStore } from "./refund-task-alert-ports.js";

export interface OpenOverdueRefundTaskAlertsPorts {
  store: RefundTaskAlertStore;
  clock: Clock;
}

export type OpenOverdueRefundTaskAlertsOutcome = { kind: "opened"; refundIds: string[] };

export async function openOverdueRefundTaskAlerts({
  store,
  clock,
}: OpenOverdueRefundTaskAlertsPorts): Promise<OpenOverdueRefundTaskAlertsOutcome> {
  return store.transaction<OpenOverdueRefundTaskAlertsOutcome>(async (tx) => {
    const now = clock.now();
    const pending = await tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert();
    const overdue = pending.filter((refund) => refundTaskAlertIsDue(refund.openedAt, now));
    for (const refund of overdue) {
      await tx.openRefundTaskAlert(refund, refundTaskAlertLevel(refund.openedAt, now), now);
    }
    return { kind: "opened", refundIds: overdue.map((refund) => refund.refundId) };
  });
}
