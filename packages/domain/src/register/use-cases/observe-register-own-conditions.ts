import type { ObserveRegisterOwnConditionsPorts } from "./register-condition-start-ports.js";

export interface ObserveRegisterOwnConditionsInput {
  held: readonly string[];
}

export type ObserveRegisterOwnConditionsOutcome = {
  kind: "observed";
  starts: ReadonlyMap<string, Date>;
};

export function observeRegisterOwnConditions(
  { store, clock }: ObserveRegisterOwnConditionsPorts,
  { held }: ObserveRegisterOwnConditionsInput,
): ObserveRegisterOwnConditionsOutcome {
  const now = clock.now();
  return store.transaction<ObserveRegisterOwnConditionsOutcome>((tx) => {
    const stored = tx.lockConditionStarts();
    const starts = new Map(held.map((condition) => [condition, stored.get(condition) ?? now]));
    tx.replaceConditionStarts(starts);
    return { kind: "observed", starts };
  });
}
