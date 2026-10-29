import type { Clock } from "../../shared/index.js";

export interface RegisterConditionStartStoreTransaction {
  lockConditionStarts(): Promise<ReadonlyMap<string, Date>>;
  replaceConditionStarts(starts: ReadonlyMap<string, Date>): Promise<void>;
}

export interface RegisterConditionStartStore {
  transaction<TOutcome>(
    work: (tx: RegisterConditionStartStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ObserveRegisterOwnConditionsPorts {
  store: RegisterConditionStartStore;
  clock: Clock;
}
