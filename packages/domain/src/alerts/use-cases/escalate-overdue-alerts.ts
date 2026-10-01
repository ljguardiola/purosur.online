import { ESCALATED_LEVEL, isDueForEscalation } from "../model/alert-escalation.js";
import type { AlertOpeningPorts } from "./alert-store.js";

export async function escalateOverdueAlerts({ store, clock }: AlertOpeningPorts): Promise<number> {
  return store.transaction(async (tx) => {
    const now = clock.now();
    const open = await tx.lockOpenAlerts();
    const dueIds = open.filter((alert) => isDueForEscalation(alert, now)).map((a) => a.alertId);
    if (dueIds.length > 0) {
      await tx.recordEscalation(dueIds, { level: ESCALATED_LEVEL, escalatedAt: now });
    }
    return dueIds.length;
  });
}
