import type { AlertConditionObservation } from "../model/alert-condition-observation.js";
import { isStablyCleared } from "../model/alert-condition-resolution.js";
import { alertKindPolicy } from "../model/alert-kind-policy.js";
import type { AlertClosingPorts } from "./alert-store.js";
import { closeStablyClearedAlert } from "./close-stably-cleared-alert.js";
import { openAlertIn } from "./open-alert.js";

export type ObserveAlertConditionOutcome =
  | { kind: "opened"; alertId: string }
  | { kind: "kept_open"; alertId: string }
  | { kind: "clearing"; alertId: string }
  | { kind: "still_clearing"; alertId: string }
  | { kind: "nothing_open" }
  | { kind: "not_a_condition_alert" };

export async function observeAlertCondition(
  { store, clock, hasher }: AlertClosingPorts,
  observation: AlertConditionObservation,
): Promise<ObserveAlertConditionOutcome> {
  const { kind, scope } = observation.holds ? observation.alert : observation;
  if (!alertKindPolicy(kind).resolvesAfterStableClear) {
    return { kind: "not_a_condition_alert" };
  }
  return store.transaction<ObserveAlertConditionOutcome>(async (tx) => {
    const now = clock.now();
    const open = await tx.lockOpenAlertOfKey(kind, scope);
    if (observation.holds) {
      if (open !== undefined) {
        if (open.conditionClearedAt === null) {
          return { kind: "kept_open", alertId: open.alertId };
        }
        if (!isStablyCleared(open.conditionClearedAt, now)) {
          await tx.recordConditionHolding(open.alertId);
          return { kind: "kept_open", alertId: open.alertId };
        }
        await closeStablyClearedAlert(tx, { ...open, kind, scope }, now, (address) =>
          hasher.hash(address),
        );
      }
      const opening = await openAlertIn(tx, observation.alert, now);
      return {
        kind: opening.kind === "opened" ? "opened" : "kept_open",
        alertId: opening.alertId,
      };
    }
    if (open === undefined) {
      return { kind: "nothing_open" };
    }
    if (open.conditionClearedAt !== null) {
      return { kind: "still_clearing", alertId: open.alertId };
    }
    await tx.recordConditionCleared(open.alertId, now);
    return { kind: "clearing", alertId: open.alertId };
  });
}
