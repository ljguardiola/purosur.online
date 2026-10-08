import type { AlertKind } from "../model/alert-catalog.js";
import type { OpenAlertInput } from "../model/alert-details.js";
import { alertKindPolicy } from "../model/alert-kind-policy.js";
import type { AlertOpeningPorts } from "./alert-store.js";
import { openAlertIn } from "./open-alert.js";

export type AlertConditionObservation =
  | { holds: true; alert: OpenAlertInput }
  | { holds: false; kind: AlertKind; scope: string };

export type ObserveAlertConditionOutcome =
  | { kind: "opened"; alertId: string }
  | { kind: "kept_open"; alertId: string }
  | { kind: "clearing"; alertId: string }
  | { kind: "still_clearing"; alertId: string }
  | { kind: "nothing_open" }
  | { kind: "not_a_condition_alert" };

export async function observeAlertCondition(
  { store, clock }: AlertOpeningPorts,
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
      if (open === undefined) {
        const opening = await openAlertIn(tx, observation.alert, now);
        return {
          kind: opening.kind === "opened" ? "opened" : "kept_open",
          alertId: opening.alertId,
        };
      }
      if (open.conditionClearedAt !== null) {
        await tx.recordConditionHolding(open.alertId);
      }
      return { kind: "kept_open", alertId: open.alertId };
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
