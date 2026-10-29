import type { Clock } from "../../shared/index.js";

export interface RegisterConditionStartStoreTransaction {
  lockConditionStarts(): ReadonlyMap<string, Date>;
  replaceConditionStarts(starts: ReadonlyMap<string, Date>): void;
}

export interface RegisterConditionStartStore {
  transaction<TOutcome>(work: (tx: RegisterConditionStartStoreTransaction) => TOutcome): TOutcome;
}

export interface ObserveRegisterOwnConditionsPorts {
  store: RegisterConditionStartStore;
  clock: Clock;
}
