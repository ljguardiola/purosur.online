import type { PendingDeferredSale } from "../../fiscal/index.js";
import { deferredSaleStanding } from "../model/deferred-sale-alert-deadlines.js";
import {
  deferredSaleDueObservation,
  deferredSaleNoLongerDueObservation,
} from "../model/deferred-sale-due-alert.js";
import type { DeferredSaleDeadlineDetectionPorts } from "./deferred-sale-deadline-ports.js";

export async function detectDeferredSaleDeadlines(
  { alerts, clock }: DeferredSaleDeadlineDetectionPorts,
  pending: readonly PendingDeferredSale[],
): Promise<number> {
  const now = clock.now();
  const dueScopes = new Set<string>();
  for (const sale of pending) {
    const standing = deferredSaleStanding(sale.occurredAt, now);
    if (standing.kind === "due" || standing.kind === "pressing") {
      dueScopes.add(sale.id);
      await alerts.observeAlertCondition(deferredSaleDueObservation(sale, standing));
    }
  }
  for (const scope of await alerts.dueAlertScopes()) {
    if (!dueScopes.has(scope)) {
      await alerts.observeAlertCondition(deferredSaleNoLongerDueObservation(scope));
    }
  }
  return dueScopes.size;
}
