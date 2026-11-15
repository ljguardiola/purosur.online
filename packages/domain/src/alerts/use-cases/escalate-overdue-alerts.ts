import { ESCALATED_LEVEL, isDueForEscalation } from "../model/alert-escalation.js";
import { alertEmailRecorder } from "./alert-email-recorder.js";
import type { AlertOpeningPorts } from "./alert-store.js";

export async function escalateOverdueAlerts({ store, clock }: AlertOpeningPorts): Promise<number> {
  return store.transaction(async (tx) => {
    const now = clock.now();
    const open = await tx.lockOpenAlerts();
    const due = open.filter((alert) => isDueForEscalation(alert, now));
    if (due.length > 0) {
      await tx.recordEscalation(
        due.map((alert) => alert.alertId),
        { level: ESCALATED_LEVEL, escalatedAt: now },
      );
      const record = alertEmailRecorder(tx);
      for (const alert of due) {
        await record(alert, "escalated", ESCALATED_LEVEL, now);
      }
    }
    return due.length;
  });
}
