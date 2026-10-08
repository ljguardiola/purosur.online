import { isStablyCleared } from "../model/alert-condition-resolution.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { keptAfterClosure } from "./kept-after-closure.js";

export async function resolveStablyClearedAlerts({
  store,
  clock,
  hasher,
}: AlertClosingPorts): Promise<number> {
  return store.transaction(async (tx) => {
    const now = clock.now();
    const cleared = await tx.lockClearedConditionAlerts();
    const stable = cleared.filter((alert) => isStablyCleared(alert.conditionClearedAt, now));
    for (const alert of stable) {
      const kept = keptAfterClosure(alert, (address) => hasher.hash(address));
      await tx.recordClosure(alert.alertId, { closedAt: now, closedBy: null, ...kept });
    }
    return stable.length;
  });
}
