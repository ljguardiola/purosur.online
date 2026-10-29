import type {
  RegisterConditionStartStore,
  RegisterConditionStartStoreTransaction,
} from "../register-condition-start-ports.js";

class FakeRegisterConditionStartTransaction implements RegisterConditionStartStoreTransaction {
  private readonly store: FakeRegisterConditionStartStore;

  constructor(store: FakeRegisterConditionStartStore) {
    this.store = store;
  }

  async lockConditionStarts(): Promise<ReadonlyMap<string, Date>> {
    this.store.operationOrder.push("lockConditionStarts");
    return new Map(this.store.starts);
  }

  async replaceConditionStarts(starts: ReadonlyMap<string, Date>): Promise<void> {
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
  operationOrder: string[] = [];

  async transaction<TOutcome>(
    work: (tx: RegisterConditionStartStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = new Map(this.starts);
    try {
      return await work(new FakeRegisterConditionStartTransaction(this));
    } catch (error) {
      this.starts = before;
      throw error;
    }
  }
}
