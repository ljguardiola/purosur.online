import type { ObserveRegisterOwnConditionsPorts } from "./register-condition-start-ports.js";

export interface ObserveRegisterOwnConditionsInput {
  held: readonly string[];
  notYetKnown: readonly string[];
}

export type ObserveRegisterOwnConditionsOutcome =
  | { kind: "observed"; starts: ReadonlyMap<string, Date> }
  | { kind: "starts_not_recorded"; starts: ReadonlyMap<string, Date>; failure: unknown };

export function observeRegisterOwnConditions(
  { store, clock }: ObserveRegisterOwnConditionsPorts,
  { held, notYetKnown }: ObserveRegisterOwnConditionsInput,
): ObserveRegisterOwnConditionsOutcome {
  const now = clock.now();
  let starts: ReadonlyMap<string, Date> = new Map(held.map((condition) => [condition, now]));
  try {
    store.transaction((tx) => {
      const stored = tx.lockConditionStarts();
      starts = new Map(held.map((condition) => [condition, stored.get(condition) ?? now]));
      const kept = new Map([
        ...[...stored].filter(([condition]) => notYetKnown.includes(condition)),
        ...starts,
      ]);
      if (
        kept.size !== stored.size ||
        [...kept.keys()].some((condition) => !stored.has(condition))
      ) {
        tx.replaceConditionStarts(kept);
      }
    });
  } catch (failure) {
    return { kind: "starts_not_recorded", starts, failure };
  }
  return { kind: "observed", starts };
}
