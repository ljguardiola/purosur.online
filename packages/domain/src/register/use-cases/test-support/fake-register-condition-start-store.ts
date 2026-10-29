import type {
  RegisterConditionStartStore,
  RegisterConditionStartStoreTransaction,
} from "../register-condition-start-ports.js";

class FakeRegisterConditionStartTransaction implements RegisterConditionStartStoreTransaction {
  private readonly store: FakeRegisterConditionStartStore;

  constructor(store: FakeRegisterConditionStartStore) {
    this.store = store;
  }

  lockConditionStarts(): ReadonlyMap<string, Date> {
    this.store.operationOrder.push("lockConditionStarts");
    if (this.store.failingLock) {
      throw new Error("lockConditionStarts failed");
    }
    return new Map(this.store.starts);
  }

  replaceConditionStarts(starts: ReadonlyMap<string, Date>): void {
    this.store.operationOrder.push("replaceConditionStarts");
    this.store.starts = new Map(starts);
    if (this.store.failingReplace) {
      throw new Error("replaceConditionStarts failed");
    }
  }
}

export class FakeRegisterConditionStartStore implements RegisterConditionStartStore {
  starts = new Map<string, Date>();
  failingReplace = false;
  failingLock = false;
  operationOrder: string[] = [];

  transaction<TOutcome>(work: (tx: RegisterConditionStartStoreTransaction) => TOutcome): TOutcome {
    const before = new Map(this.starts);
    try {
      return work(new FakeRegisterConditionStartTransaction(this));
    } catch (error) {
      this.starts = before;
      throw error;
    }
  }
}
