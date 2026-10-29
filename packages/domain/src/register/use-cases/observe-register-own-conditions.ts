import type { ObserveRegisterOwnConditionsPorts } from "./register-condition-start-ports.js";

export interface ObserveRegisterOwnConditionsInput {
  held: readonly string[];
}

export type ObserveRegisterOwnConditionsOutcome = {
  kind: "observed";
  starts: ReadonlyMap<string, Date>;
};

export async function observeRegisterOwnConditions(
  { store, clock }: ObserveRegisterOwnConditionsPorts,
  { held }: ObserveRegisterOwnConditionsInput,
): Promise<ObserveRegisterOwnConditionsOutcome> {
  const now = clock.now();
  return store.transaction<ObserveRegisterOwnConditionsOutcome>(async (tx) => {
    const stored = await tx.lockConditionStarts();
    const starts = new Map(held.map((condition) => [condition, stored.get(condition) ?? now]));
    await tx.replaceConditionStarts(starts);
    return { kind: "observed", starts };
  });
}
