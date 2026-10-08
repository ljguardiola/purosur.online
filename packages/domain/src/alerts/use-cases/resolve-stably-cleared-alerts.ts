import { isStablyCleared } from "../model/alert-condition-resolution.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { closeStablyClearedAlert } from "./close-stably-cleared-alert.js";

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
      await closeStablyClearedAlert(tx, alert, now, (address) => hasher.hash(address));
    }
    return stable.length;
  });
}
